'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { currentUser, currentOrganisation, organisationFor } from '@/lib/auth'
import { registerOrganisation, updateOrganisation } from '@/modules/organisations/service'
import type { OrgType } from '@/lib/tiers'
import { geocodeShopAddress, type GeocodePrecision } from '@/lib/geocode'

import {
  parseForm,
  z,
  requiredText,
  optionalText,
  latitude,
  longitude,
  orgType,
  phone,
} from '@/lib/forms'

export interface OnboardingState {
  error?: string
  notice?: string
}

/**
 * Nigeria's bounding box, with a little margin. A locked shop location
 * outside it is a typo or a VPN, not a Nigerian shop.
 */
const inNigeria = (lat: number, lng: number) => lat >= 4 && lat <= 14 && lng >= 2.5 && lng <= 14.8

const registerBusinessSchema = z.object({
  name: requiredText('Your business name', 160),
  type: orgType,
  registrationNumber: optionalText(40),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  phone: phone.optional().or(z.literal('')),
  // The location is locked in the form, from GPS or a looked-up address,
  // before the business can be submitted - never typed as raw numbers.
  lat: latitude,
  lng: longitude,
  // 'pin': placed by hand on the map, where the address was only known by town.
  locationSource: z.enum(['gps', 'address', 'pin'], {
    message: 'Lock your shop location before submitting.',
  }),
})

const updateBusinessSchema = z.object({
  name: requiredText('Your business name', 160).optional(),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  phone: phone.optional().or(z.literal('')),
  // No lat/lng: a shop's location is locked at registration. Only an
  // administrator can move it (moveOrganisationAction).
  deliveryRadiusKm: z.coerce.number().min(1).max(2000).optional(),
  avgDispatchMinutes: z.coerce.number().int().min(5).max(10_080).optional(),
})

export async function registerBusinessAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/onboarding')

  const existing = await currentOrganisation()
  if (existing) return { error: 'This account already has a business registered' }

  const parsed = parseForm(registerBusinessSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const input = parsed.data
  if (!inNigeria(input.lat, input.lng)) {
    return { error: 'That location is outside Nigeria. Lock the location of the shop itself.' }
  }

  try {
    await registerOrganisation({
      name: input.name,
      type: input.type as OrgType,
      ownerUserId: user.id,
      registrationNumber: input.registrationNumber,
      lat: input.lat,
      lng: input.lng,
      address: input.address,
      city: input.city,
      state: input.state,
      phone: input.phone || user.phone,
      email: user.email,
    })
  } catch (err) {
    console.error('[onboarding] registration failed', err)
    return { error: 'We could not register that business. Please try again.' }
  }

  revalidatePath('/', 'layout')
  redirect('/partner?welcome=1')
}

export async function updateBusinessAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const org = await organisationFor('settings')
  if (!org) return { error: 'Only the business owner can change business details' }

  const parsed = parseForm(updateBusinessSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const patch = parsed.data

  await updateOrganisation(org.id, {
    name: patch.name,
    address: patch.address,
    city: patch.city,
    state: patch.state,
    phone: patch.phone || null,
    deliveryRadiusKm: patch.deliveryRadiusKm,
    avgDispatchMinutes: patch.avgDispatchMinutes,
  })

  revalidatePath('/partner/settings')
  return { notice: 'Business details updated.' }
}

export interface GeocodeState {
  result?: { lat: number; lng: number; label: string; precision: GeocodePrecision }
  error?: string
}

const geocodeSchema = z.object({
  address: requiredText('The street address', 300),
  city: requiredText('The city or town', 80),
  state: requiredText('The state', 80),
})

/**
 * Looks a shop address up on the map, for the "find by address" way of
 * locking a location. Signed-in users only - it calls a public service on
 * our behalf, and it should not be an open proxy to it.
 */
export async function geocodeShopAddressAction(input: {
  address: string
  city: string
  state: string
}): Promise<GeocodeState> {
  const user = await currentUser()
  if (!user) return { error: 'Sign in to look up an address.' }

  const parsed = geocodeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Fill in the street address, city and state first.' }
  }
  try {
    const result = await geocodeShopAddress({
      street: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state,
    })
    if (!result || !inNigeria(result.lat, result.lng)) {
      return {
        error: 'We could not find that address on the map. Check it, or use GPS in your shop.',
      }
    }
    return { result }
  } catch (err) {
    console.error('[onboarding] geocoding failed', err)
    return { error: 'The map lookup is not responding. Try again, or use GPS in your shop.' }
  }
}
