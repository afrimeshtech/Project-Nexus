'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { currentUser, currentOrganisation, organisationFor } from '@/lib/auth'
import { registerOrganisation, updateOrganisation } from '@/modules/organisations/service'
import type { OrgType } from '@/lib/tiers'

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

const registerBusinessSchema = z.object({
  name: requiredText('Your business name', 160),
  type: orgType,
  registrationNumber: optionalText(40),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  phone: phone.optional().or(z.literal('')),
  lat: latitude,
  lng: longitude,
})

const updateBusinessSchema = z.object({
  name: requiredText('Your business name', 160).optional(),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  phone: phone.optional().or(z.literal('')),
  lat: latitude.optional(),
  lng: longitude.optional(),
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
    lat: patch.lat,
    lng: patch.lng,
    deliveryRadiusKm: patch.deliveryRadiusKm,
    avgDispatchMinutes: patch.avgDispatchMinutes,
  })

  revalidatePath('/partner/settings')
  return { notice: 'Business details updated.' }
}
