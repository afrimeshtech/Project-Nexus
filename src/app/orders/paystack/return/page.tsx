import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getSql } from '@/db/client'
import { verifyPaystackTransaction } from '@/modules/payments/service'
import { settlePaymentByProviderRef } from '@/modules/orders/service'

export const dynamic = 'force-dynamic'

/**
 * Where Paystack returns the customer after they pay.
 *
 * This page settles nothing on the strength of having been loaded. Anyone can
 * request it with any reference, and a customer who closes the tab never
 * requests it at all — so it does two things only:
 *
 *   1. finds which order the reference belongs to, so the customer lands
 *      somewhere useful instead of on a bare confirmation,
 *   2. asks Paystack directly whether that reference was paid, and settles it
 *      if so.
 *
 * Step 2 is a reconciliation path, not the primary one. The webhook is
 * normally faster and usually got there first, in which case this is a no-op —
 * settlement is idempotent. But a webhook that is delayed or dropped would
 * otherwise leave a customer who has genuinely paid looking at an unpaid
 * order, and `verify` is authoritative in a way the redirect is not.
 */
export default async function PaystackReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>
}) {
  const query = await searchParams
  // Paystack sends both; they carry the same value.
  const reference = query.reference ?? query.trxref
  const user = await requireUser('/orders')

  if (!reference) redirect('/orders')

  const sql = await getSql()
  const payment = await sql.one<{ order_id: string | null; payer_user_id: string }>(
    `SELECT order_id, payer_user_id FROM payments WHERE provider_ref = $1`,
    [reference],
  )

  // A reference that is not ours, or not this user's, gets nothing back that
  // would confirm it exists.
  if (!payment?.order_id || payment.payer_user_id !== user.id) redirect('/orders')

  try {
    const verified = await verifyPaystackTransaction(reference)
    if (verified.paid) {
      await settlePaymentByProviderRef(reference, {
        amount: verified.amount,
        currency: verified.currency,
      })
    }
  } catch (err) {
    // The order page reads the payment's real state from the database, so a
    // failed verify costs the customer nothing but a moment's delay until the
    // webhook lands.
    console.error(`[paystack:return] verify failed for ${reference}`, err)
  }

  redirect(`/orders/${payment.order_id}?payment=checked`)
}
