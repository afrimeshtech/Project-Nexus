'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, ADMIN_ROLES } from '@/lib/auth'
import {
  rejectOrganisation,
  setOrganisationStatus,
  updateOrganisation,
  verifyOrganisation,
} from '@/modules/organisations/service'
import { setProductStatus } from '@/modules/catalog/service'
import { setWeight, type RankingScope } from '@/modules/recommendation/service'
import { resolveAlert, runRiskSweep } from '@/modules/platform/service'
import { retryPending } from '@/modules/notifications/service'
import { expireStaleReservations } from '@/modules/inventory/service'
import { setReferralPoints } from '@/modules/rewards/service'
import { PROGRAMMES, type Programme } from '@/lib/points'

import { parseForm, z, uuid, requiredText, latitude, longitude } from '@/lib/forms'

export interface AdminActionState {
  error?: string
  notice?: string
}

const orgIdSchema = z.object({ organisationId: uuid('business') })

const rejectSchema = z.object({
  organisationId: uuid('business'),
  reason: requiredText('A reason', 300),
})

const suspensionSchema = z.object({
  organisationId: uuid('business'),
  status: z.enum(['active', 'suspended']),
})

const moderateSchema = z.object({
  productId: uuid('product'),
  status: z.enum(['active', 'blocked', 'draft']),
})

const alertSchema = z.object({ alertId: uuid('alert') })

const moveSchema = z.object({
  organisationId: uuid('business'),
  lat: latitude,
  lng: longitude,
})

const weightScopeSchema = z.enum(['consumer', 'outlet', 'merchant']).catch('consumer')

/**
 * Administration is the one place where a mistake is expensive and hard to
 * reverse, so every action re-checks the caller's role rather than trusting
 * that the page they came from was guarded.
 */
async function requireAdmin() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/admin')
  if (!ADMIN_ROLES.includes(user.role)) redirect('/forbidden')
  return user
}

/** Auditors may read the console but may not change anything. */
async function requireMutatingAdmin() {
  const user = await requireAdmin()
  if (user.role === 'auditor') {
    throw new Error('Auditors have read-only access')
  }
  return user
}

export async function verifyOrganisationAction(formData: FormData) {
  const admin = await requireMutatingAdmin()
  const parsed = parseForm(orgIdSchema, formData)
  if (!parsed.ok) return

  await verifyOrganisation(parsed.data.organisationId, admin.id)
  revalidatePath('/admin/organisations')
  revalidatePath('/admin')
}

export async function rejectOrganisationAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireMutatingAdmin()
  const parsed = parseForm(rejectSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  await rejectOrganisation(parsed.data.organisationId, admin.id, parsed.data.reason)
  revalidatePath('/admin/organisations')
  return { notice: 'Business rejected and notified.' }
}

export async function toggleSuspensionAction(formData: FormData) {
  await requireMutatingAdmin()
  const parsed = parseForm(suspensionSchema, formData)
  if (!parsed.ok) return

  await setOrganisationStatus(parsed.data.organisationId, parsed.data.status)
  revalidatePath('/admin/organisations')
}

/**
 * Moves a shop. A retailer's location is locked at registration - buyers are
 * matched by distance - so relocating one is an administrator's call, for a
 * shop that has genuinely moved premises. The shop's listings move with it.
 */
export async function moveOrganisationAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireMutatingAdmin()
  const parsed = parseForm(moveSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { organisationId, lat, lng } = parsed.data
  if (lat < 4 || lat > 14 || lng < 2.5 || lng > 14.8) {
    return { error: 'That point is outside Nigeria.' }
  }

  await updateOrganisation(organisationId, { lat, lng })
  revalidatePath('/admin/organisations')
  return { notice: `Moved to ${lat.toFixed(5)}, ${lng.toFixed(5)}.` }
}

export async function moderateProductAction(formData: FormData) {
  const admin = await requireMutatingAdmin()
  const parsed = parseForm(moderateSchema, formData)
  if (!parsed.ok) return

  await setProductStatus(parsed.data.productId, parsed.data.status, admin.id)
  revalidatePath('/admin/products')
}

/**
 * Retune the marketplace. "Weights should be configurable without changing
 * application code" (SAD) — this is that requirement, made operable.
 */
export async function updateWeightsAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireMutatingAdmin()
  const scope = weightScopeSchema.parse(formData.get('scope')) as RankingScope

  // The weight field names are dynamic (one per ranking factor), so this is
  // validated with an explicit schema per entry rather than a fixed object.
  // The column is NUMERIC(5,2); only the ratio between weights matters, so
  // that ceiling is ample — but it must be reported, not hit as a 500.
  const weightSchema = z.coerce
    .number({ message: 'must be a number' })
    .min(0, { message: 'cannot be negative' })
    .max(999.99, { message: 'must be 999.99 or less' })

  let written = 0
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('weight_')) continue
    const factor = key.slice(7)
    const result = weightSchema.safeParse(value)
    if (!result.success) {
      return { error: `“${factor}” ${result.error.issues[0]?.message ?? 'is not valid'}.` }
    }
    await setWeight(scope, factor, result.data)
    written++
  }

  revalidatePath('/admin/ranking')
  revalidatePath('/about')
  return { notice: `${written} weights updated — ranking changes take effect on the next search.` }
}

const referralPointsSchema = z.object(
  Object.fromEntries(
    PROGRAMMES.map((programme) => [
      `points_${programme}`,
      z.coerce
        .number({ message: `The ${programme} award must be a number.` })
        .int({ message: `The ${programme} award must be a whole number of points.` })
        .min(0, { message: `The ${programme} award cannot be negative.` })
        .max(1_000_000, { message: `The ${programme} award is unrealistically large.` }),
    ]),
  ) as Record<string, z.ZodType<number>>,
)

/**
 * Retune the referral programme. Award values are data, not code, for the same
 * reason the ranking weights are: growth incentives get adjusted on a weekly
 * cadence and must never require a deployment.
 */
export async function updateReferralPointsAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireMutatingAdmin()

  const parsed = parseForm(referralPointsSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  const values: Partial<Record<Programme, number>> = {}
  for (const programme of PROGRAMMES) {
    values[programme] = parsed.data[`points_${programme}`] as number
  }
  await setReferralPoints(values)

  revalidatePath('/admin/rewards')
  revalidatePath('/rewards')
  revalidatePath('/partner/rewards')
  return { notice: 'Referral awards updated — they apply to every referral settled from now on.' }
}

export async function resolveAlertAction(formData: FormData) {
  await requireMutatingAdmin()
  const parsed = parseForm(alertSchema, formData)
  if (!parsed.ok) return

  await resolveAlert(parsed.data.alertId)
  revalidatePath('/admin/fraud')
}

export async function runSweepAction() {
  await requireMutatingAdmin()
  await runRiskSweep()
  revalidatePath('/admin/fraud')
}

/** Operational maintenance the SAD's observability section implies. */
export async function runMaintenanceAction() {
  await requireMutatingAdmin()
  // Sequential, not concurrent: each of these opens its own transaction, and
  // interleaving transactions on one connection is a good way to deadlock.
  await expireStaleReservations()
  await retryPending(100)
  await runRiskSweep()
  revalidatePath('/admin/health')
}
