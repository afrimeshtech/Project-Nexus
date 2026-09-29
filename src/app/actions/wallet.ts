'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, organisationFor } from '@/lib/auth'
import { deposit } from '@/modules/wallet/service'
import { attachProviderRef, createPayment, gateway, markPayment } from '@/modules/payments/service'
import { withTx } from '@/db/client'
import { toMinor } from '@/lib/money'

import { parseForm, z, nairaAmount, paymentMethod } from '@/lib/forms'

export interface WalletActionState {
  error?: string
  notice?: string
}

const MAX_TOPUP_NAIRA = 5_000_000

const topUpSchema = z.object({
  amount: nairaAmount('Top-up amount', 100).refine((value) => value <= MAX_TOPUP_NAIRA, {
    message: `Single top-ups are capped at ₦${MAX_TOPUP_NAIRA.toLocaleString()}.`,
  }),
  method: paymentMethod.catch('card'),
  scope: z.enum(['user', 'organisation']).catch('user'),
})

/**
 * Wallet top-up. The money genuinely has to come from somewhere, so this runs
 * through the same payment gateway abstraction an order does — and, like an
 * order, it only credits the wallet once a gateway says the money arrived.
 *
 * With an asynchronous provider that is not here: `charge()` returns `pending`
 * with somewhere to send the customer, and the webhook credits the wallet.
 * The payment row carries the credit target, so a business top-up lands in the
 * organisation's wallet and not in the wallet of whoever pressed the button.
 */
export async function topUpAction(
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/wallet')

  const parsed = parseForm(topUpSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { amount: naira, scope } = parsed.data

  const amount = toMinor(naira)

  let ownerType: 'user' | 'organisation' = 'user'
  let ownerId = user.id
  if (scope === 'organisation') {
    const org = await organisationFor('funds')
    if (!org) return { error: 'Only the business owner can move business funds' }
    ownerType = 'organisation'
    ownerId = org.id
  }

  const outcome = await withTx(async (tx) => {
    const payment = await createPayment(tx, {
      orderId: null,
      payerUserId: user.id,
      method: parsed.data.method,
      amount,
      currency: 'NGN',
      creditOwner: { type: ownerType, id: ownerId },
    })

    const charge = await gateway().charge({
      amount,
      currency: 'NGN',
      method: parsed.data.method,
      // The payment row's id, so the webhook can find what to credit.
      reference: payment.id,
      customer: { userId: user.id, email: user.email, phone: user.phone },
      metadata: { purpose: 'wallet_topup', ownerType, ownerId },
    })

    if (charge.status === 'failed') {
      await markPayment(tx, payment.id, 'failed', {
        providerRef: charge.providerRef,
        failureReason: charge.failureReason,
      })
      return { kind: 'failed' as const, reason: charge.failureReason }
    }

    if (charge.status === 'pending') {
      await attachProviderRef(tx, payment.id, charge.providerRef)
      return { kind: 'pending' as const, action: charge.actionRequired }
    }

    // Settled inline by a synchronous gateway.
    await markPayment(tx, payment.id, 'succeeded', { providerRef: charge.providerRef })
    await deposit(ownerType, ownerId, amount, 'Wallet top-up', tx)
    return { kind: 'credited' as const }
  })

  if (outcome.kind === 'failed') {
    return { error: outcome.reason ?? 'That payment was declined' }
  }

  if (outcome.kind === 'pending') {
    if (outcome.action?.kind === 'redirect') redirect(outcome.action.value)
    return { notice: 'Waiting for the payment provider to confirm your top-up.' }
  }

  revalidatePath('/wallet')
  revalidatePath('/partner/wallet')
  return { notice: `₦${naira.toLocaleString()} added to your wallet.` }
}

// Withdrawals moved to app/actions/payouts.ts: they now go to a saved,
// name-verified bank account through the payouts module, instead of only
// debiting the ledger.
