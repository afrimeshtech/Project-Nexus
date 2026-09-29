'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, organisationFor } from '@/lib/auth'
import { InsufficientFundsError } from '@/modules/wallet/service'
import { redeemPoints, RedemptionError } from '@/modules/rewards/service'
import { formatMoney } from '@/lib/money'
import { MIN_REDEEMABLE_POINTS } from '@/lib/points'

import { parseForm, z } from '@/lib/forms'

export interface RewardsActionState {
  error?: string
  notice?: string
}

const redeemSchema = z.object({
  points: z.coerce
    .number({ message: 'Enter the number of points to convert.' })
    .int({ message: 'Points convert in whole numbers.' })
    .min(MIN_REDEEMABLE_POINTS, {
      message: `You can convert from ${MIN_REDEEMABLE_POINTS.toLocaleString('en-NG')} points upwards.`,
    })
    .max(50_000_000, { message: 'That is more points than any account holds.' }),
  scope: z.enum(['user', 'organisation']).catch('user'),
})

/**
 * Convert reward points into spendable naira.
 *
 * The scope comes from the form only as a choice between "me" and "my
 * business"; which business that is is resolved from the session, never from
 * the request, so nobody can cash out someone else's points.
 */
export async function redeemPointsAction(
  _prev: RewardsActionState,
  formData: FormData,
): Promise<RewardsActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/rewards')

  const parsed = parseForm(redeemSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { points, scope } = parsed.data

  let ownerType: 'user' | 'organisation' = 'user'
  let ownerId = user.id
  if (scope === 'organisation') {
    const org = await organisationFor('rewards')
    if (!org) return { error: 'Only the business owner can redeem business points' }
    ownerType = 'organisation'
    ownerId = org.id
  }

  try {
    const result = await redeemPoints(ownerType, ownerId, points)
    revalidatePath('/rewards')
    revalidatePath('/partner/rewards')
    revalidatePath('/wallet')
    revalidatePath('/partner/wallet')
    return {
      notice: `${points.toLocaleString('en-NG')} points converted — ${formatMoney(result.amount)} is in your wallet.`,
    }
  } catch (err) {
    if (err instanceof RedemptionError) return { error: err.message }
    if (err instanceof InsufficientFundsError) {
      return { error: 'You do not have that many points available.' }
    }
    console.error('[rewards] redemption failed', err)
    return { error: 'We could not convert those points. Please try again.' }
  }
}
