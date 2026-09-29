'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, currentOrganisation, organisationFor } from '@/lib/auth'
import { assignRider, riderIsAvailable, DeliveryError } from '@/modules/logistics/service'
import {
  advanceOrder,
  cancelOrder,
  getOrder,
  rateOrder,
  BusinessRuleError,
  type OrderStatus,
} from '@/modules/orders/service'

import { parseForm, z, uuid, stars, requiredText } from '@/lib/forms'

export interface OrderActionState {
  error?: string
  notice?: string
}

const rateSchema = z.object({
  orderId: uuid('order'),
  stars,
  comment: z.string().trim().max(1000).optional(),
})

const cancelSchema = z.object({
  orderId: uuid('order'),
  reason: requiredText('A reason', 300),
})

const advanceSchema = z.object({
  orderId: uuid('order'),
  next: z.enum(
    ['confirmed', 'preparing', 'dispatched', 'delivered', 'completed', 'cancelled', 'refunded'],
    { message: 'That is not a valid order status.' },
  ),
})

const dispatchSchema = z.object({
  orderId: uuid('order'),
  // Empty means "put it on the open board" rather than a named rider.
  riderId: uuid('rider').optional().or(z.literal('')),
})

/**
 * Hand an order to a delivery partner.
 *
 * From `preparing`, this dispatches the order (which raises the delivery job)
 * and, if a rider was chosen, gives the job straight to them. From
 * `dispatched`, with the job still unclaimed on the board, it only assigns -
 * the "nobody has picked it up, send Musa" case.
 *
 * The rider is checked before the order moves, so choosing someone who cannot
 * take it does not leave the order dispatched with nobody named.
 */
export async function dispatchOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(dispatchSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { orderId } = parsed.data
  const riderId = parsed.data.riderId || null

  const org = await organisationFor('dispatch')
  const order = await getOrder(orderId)
  if (!order || !org || order.seller_org_id !== org.id) {
    return { error: 'You are not allowed to dispatch this order' }
  }

  try {
    if (riderId && !(await riderIsAvailable(riderId))) {
      return { error: 'That rider is not available. Choose another, or use the open job board.' }
    }
    if (order.status === 'preparing') {
      await advanceOrder(orderId, 'dispatched', user.id)
    } else if (order.status !== 'dispatched') {
      return { error: 'Only an order being prepared can be dispatched.' }
    } else if (!riderId) {
      return { error: 'Choose a rider to assign.' }
    }
    if (riderId) await assignRider(orderId, org.id, riderId, user.id)
  } catch (err) {
    if (err instanceof BusinessRuleError || err instanceof DeliveryError) {
      return { error: err.message }
    }
    console.error('[orders] dispatch failed', err)
    return { error: 'We could not dispatch that order.' }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/partner/orders')
  revalidatePath(`/partner/orders/${orderId}`)
  return { notice: riderId ? 'Dispatched to your rider.' : 'Dispatched to the open job board.' }
}

/** Buyer rates a delivered order. Verified transactions only (PRD §12). */
export async function rateOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(rateSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    await rateOrder(parsed.data.orderId, user.id, parsed.data.stars, parsed.data.comment || null)
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[orders] rating failed', err)
    return { error: 'We could not save that rating.' }
  }

  revalidatePath(`/orders/${parsed.data.orderId}`)
  return { notice: 'Thanks — your rating helps other buyers.' }
}

export async function cancelOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(cancelSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { orderId, reason } = parsed.data

  const order = await getOrder(orderId)
  if (!order) return { error: 'Order not found' }

  // Either side of the transaction may cancel; nobody else may.
  const org = await currentOrganisation()
  const isBuyer = order.buyer_user_id === user.id
  const isSeller = org?.id === order.seller_org_id
  if (!isBuyer && !isSeller) return { error: 'You cannot cancel this order' }

  try {
    await cancelOrder(orderId, user.id, reason)
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[orders] cancellation failed', err)
    return { error: 'We could not cancel that order.' }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/partner/orders')
  return { notice: 'Order cancelled.' }
}

/**
 * Seller moves an order along its lifecycle. The buyer is allowed exactly one
 * transition - confirming delivery - because they are the party who knows the
 * goods arrived, and that is what releases escrow.
 */
export async function advanceOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(advanceSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const orderId = parsed.data.orderId
  const next = parsed.data.next as OrderStatus

  const order = await getOrder(orderId)
  if (!order) return { error: 'Order not found' }

  const org = await currentOrganisation()
  const isSeller = org?.id === order.seller_org_id
  const isBuyer = order.buyer_user_id === user.id
  const buyerMayDo = next === 'completed' && order.status === 'delivered'

  if (!isSeller && !(isBuyer && buyerMayDo)) {
    return { error: 'You are not allowed to make that change' }
  }

  try {
    await advanceOrder(orderId, next, user.id)
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[orders] transition failed', err)
    return { error: 'We could not update that order.' }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/partner/orders')
  revalidatePath(`/partner/orders/${orderId}`)
  return { notice: 'Order updated.' }
}
