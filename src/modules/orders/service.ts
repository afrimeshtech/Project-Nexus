import { randomBytes } from 'node:crypto'
import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'
import {
  consumeReservations,
  releaseReservations,
  reserveStock,
  returnStock,
  InsufficientStockError,
} from '@/modules/inventory/service'
import {
  attachProviderRef,
  claimPendingPayment,
  claimWebhookEvent,
  createPayment,
  findPaymentByProviderRef,
  gateway,
  markPayment,
  type PaymentMethod,
} from '@/modules/payments/service'
import {
  ensureWallet,
  payForOrder,
  releaseEscrow,
  settleDeliveryToSeller,
  payCashback,
  refundOrder as refundToWallet,
  deposit,
  InsufficientFundsError,
} from '@/modules/wallet/service'
import { requestDelivery, cancelOpenJob, riderWasPaid } from '@/modules/logistics/service'
import { qualifyReferral } from '@/modules/rewards/service'
import { canTrade, priceColumnFor, TIER } from '@/lib/tiers'
import { haversineKm, estimateEtaMinutes } from '@/lib/geo'
import { platformFee, cashbackFor, DEFAULT_CURRENCY } from '@/lib/money'
import { RATINGS_LAUNCHED } from '@/lib/launch-ratings'

/**
 * MODULE: orders
 *
 * The order lifecycle, and the only place the commerce, inventory, payment and
 * wallet modules are composed. Every multi-module operation runs inside one
 * database transaction, so an order can never exist with stock reserved but no
 * ledger entry, or money moved but stock untouched.
 *
 * Lifecycle (PRD Business Process Overview):
 *
 *   pending_payment -> confirmed -> preparing -> dispatched -> delivered -> completed
 *                   \-> cancelled (stock released)      \-> refunded
 *
 * Escrow is held from payment until delivery; `completed` releases it to the
 * seller's spendable balance.
 */

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface Order {
  id: string
  order_number: string
  buyer_user_id: string
  buyer_org_id: string | null
  seller_org_id: string
  buyer_tier: number
  seller_tier: number
  status: OrderStatus
  payment_status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  subtotal: number
  delivery_fee: number
  platform_fee: number
  total: number
  currency: string
  fulfilment: 'pickup' | 'delivery'
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  distance_km: number | null
  eta_minutes: number | null
  placed_at: Date
  confirmed_at: Date | null
  dispatched_at: Date | null
  delivered_at: Date | null
  completed_at: Date | null
  cancelled_at: Date | null
  cancel_reason: string | null
}

export interface OrderLine {
  id: string
  product_id: string
  inventory_item_id: string
  name_snapshot: string
  image_snapshot: string | null
  unit_price: number
  qty: number
  line_total: number
}

export interface OrderDetail extends Order {
  items: OrderLine[]
  seller_name: string
  seller_slug: string
  seller_phone: string | null
  seller_address: string | null
  seller_logo: string | null
  buyer_name: string
  buyer_phone: string | null
  buyer_org_name: string | null
  rating_stars: number | null
}

export class BusinessRuleError extends Error {}

/** Delivery pricing. Flat dispatch fee plus distance, waived for pickup. */
export function deliveryFeeFor(distanceKm: number, fulfilment: 'pickup' | 'delivery'): number {
  if (fulfilment === 'pickup') return 0
  const base = 30_000 // ₦300
  const perKm = 12_000 // ₦120
  return base + Math.round(distanceKm * perKm)
}

function orderNumber(): string {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `AM-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`
}

// ---------------------------------------------------------------------------
// Placing an order
// ---------------------------------------------------------------------------

export interface PlaceOrderInput {
  buyerUserId: string
  /** null for a consumer; the buying business for every B2B tier. */
  buyerOrgId: string | null
  buyerTier: number
  sellerOrgId: string
  items: { inventoryItemId: string; qty: number }[]
  fulfilment: 'pickup' | 'delivery'
  deliveryAddress?: string | null
  deliveryLat: number
  deliveryLng: number
}

export async function placeOrder(input: PlaceOrderInput): Promise<OrderDetail> {
  if (!input.items.length) throw new BusinessRuleError('Your basket is empty')

  return withTx(async (tx) => {
    const seller = await tx.one<{
      id: string
      name: string
      tier_level: number
      lat: number
      lng: number
      status: string
      verification: string
      avg_dispatch_minutes: number
      owner_user_id: string | null
    }>(`SELECT * FROM organisations WHERE id = $1`, [input.sellerOrgId])

    if (!seller) throw new BusinessRuleError('Seller not found')
    if (seller.status !== 'active' || seller.verification !== 'verified') {
      throw new BusinessRuleError('This seller is not currently accepting orders')
    }

    // PRD §12 business rules, enforced before anything is written. The orders
    // table also carries this as a CHECK constraint.
    if (!canTrade(input.buyerTier, seller.tier_level)) {
      throw new BusinessRuleError(
        input.buyerTier === TIER.consumer
          ? 'Consumers can only buy from retail outlets, not from warehouses or merchants'
          : 'You can only source from the tier directly above you in the supply chain',
      )
    }

    const priceCol = priceColumnFor(input.buyerTier)

    let subtotal = 0
    const lines: {
      productId: string
      inventoryItemId: string
      name: string
      image: string | null
      unitPrice: number
      qty: number
    }[] = []

    for (const requested of input.items) {
      const item = await tx.one<{
        id: string
        product_id: string
        organisation_id: string
        qty_available: number
        min_order_qty: number
        promo_price: number | null
        tier_price: number | null
        product_name: string
        image_url: string | null
      }>(
        `SELECT i.id, i.product_id, i.organisation_id, i.qty_available, i.min_order_qty,
                i.promo_price, i.${priceCol} AS tier_price,
                p.name AS product_name, p.image_url
           FROM inventory_items i
           JOIN products p ON p.id = i.product_id
          WHERE i.id = $1 AND i.is_listed = TRUE`,
        [requested.inventoryItemId],
      )

      if (!item) throw new BusinessRuleError('One of the items is no longer available')
      if (item.organisation_id !== input.sellerOrgId) {
        // One order = one seller. A multi-shop basket becomes several orders,
        // because fulfilment, settlement and delivery are all per-seller.
        throw new BusinessRuleError('All items in an order must come from the same seller')
      }
      if (requested.qty < item.min_order_qty) {
        throw new BusinessRuleError(
          `${item.product_name} has a minimum order quantity of ${item.min_order_qty}`,
        )
      }

      const unitPrice = item.promo_price ?? item.tier_price
      if (unitPrice === null || unitPrice === undefined) {
        throw new BusinessRuleError(`${item.product_name} is not priced for your account type`)
      }

      subtotal += unitPrice * requested.qty
      lines.push({
        productId: item.product_id,
        inventoryItemId: item.id,
        name: item.product_name,
        image: item.image_url,
        unitPrice,
        qty: requested.qty,
      })
    }

    const distanceKm = haversineKm(
      { lat: input.deliveryLat, lng: input.deliveryLng },
      { lat: seller.lat, lng: seller.lng },
    )
    const deliveryFee = deliveryFeeFor(distanceKm, input.fulfilment)
    const fee = platformFee(subtotal)
    const total = subtotal + deliveryFee
    const eta = estimateEtaMinutes(distanceKm, seller.avg_dispatch_minutes)

    const order = await tx.one<Order>(
      `INSERT INTO orders
         (order_number, buyer_user_id, buyer_org_id, seller_org_id, buyer_tier, seller_tier,
          subtotal, delivery_fee, platform_fee, total, currency, fulfilment,
          delivery_address, delivery_lat, delivery_lng, distance_km, eta_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        orderNumber(),
        input.buyerUserId,
        input.buyerOrgId,
        input.sellerOrgId,
        input.buyerTier,
        seller.tier_level,
        subtotal,
        deliveryFee,
        fee,
        total,
        DEFAULT_CURRENCY,
        input.fulfilment,
        input.deliveryAddress ?? null,
        input.deliveryLat,
        input.deliveryLng,
        distanceKm.toFixed(2),
        eta,
      ],
    )
    if (!order) throw new Error('Failed to create order')

    for (const line of lines) {
      await tx.query(
        `INSERT INTO order_items
           (order_id, product_id, inventory_item_id, name_snapshot, image_snapshot, unit_price, qty, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.id,
          line.productId,
          line.inventoryItemId,
          line.name,
          line.image,
          line.unitPrice,
          line.qty,
          line.unitPrice * line.qty,
        ],
      )
      // Reserve immediately. If any line cannot be held, the whole transaction
      // rolls back and nothing is left half-reserved.
      await reserveStock(tx, line.inventoryItemId, line.qty, order.id, input.buyerUserId)
    }

    await logOrderEvent(tx, order.id, 'pending_payment', 'Order placed', input.buyerUserId)
    await publish(
      {
        type: EVENT.OrderPlaced,
        aggregateType: 'order',
        aggregateId: order.id,
        actorUserId: input.buyerUserId,
        payload: {
          orderNumber: order.order_number,
          sellerOrgId: input.sellerOrgId,
          total,
          itemCount: lines.length,
          buyerTier: input.buyerTier,
        },
      },
      tx,
    )

    if (seller.owner_user_id) {
      await queueNotification(
        {
          userId: seller.owner_user_id,
          title: 'New order received',
          body: `Order ${order.order_number} — ${lines.length} item(s). Awaiting payment.`,
          category: 'order',
          referenceType: 'order',
          referenceId: order.id,
        },
        tx,
      )
    }

    return loadOrder(tx, order.id)
  })
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export interface PayResult {
  ok: boolean
  order?: OrderDetail
  error?: string
  actionRequired?: { kind: string; value: string }
  /** True when the provider has taken the attempt but not yet the money. */
  awaitingProvider?: boolean
}

/**
 * Settle an order. All methods converge on the wallet: an external charge
 * (card/transfer/USSD/QR) deposits into the buyer's wallet first, then the
 * wallet pays the order. One money path means one place where the ledger can
 * be reasoned about.
 *
 * Two shapes of gateway run through here:
 *
 *   synchronous (wallet, mock) - the outcome is known inside this transaction
 *     and the order is confirmed before the function returns.
 *   asynchronous (Paystack, and every real provider) - `charge()` answers
 *     `pending` with somewhere to send the customer. Nothing is credited and
 *     nothing is confirmed. The order stays in `pending_payment` holding its
 *     reserved stock, and `settlePaymentByProviderRef` finishes the job when
 *     the webhook arrives.
 *
 * The one thing this function must never do is confirm an order against money
 * no provider has told us it received.
 */
export async function payOrder(
  orderId: string,
  payerUserId: string,
  method: PaymentMethod,
): Promise<PayResult> {
  try {
    const result = await withTx(async (tx) => {
      const order = await tx.one<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId])
      if (!order) throw new BusinessRuleError('Order not found')
      if (order.buyer_user_id !== payerUserId) throw new BusinessRuleError('This is not your order')
      if (order.status !== 'pending_payment') {
        throw new BusinessRuleError('This order has already been paid or cancelled')
      }

      /*
       * An attempt already in flight with a provider must not be duplicated.
       * Two initialised references against one order are two ways to pay for
       * it, and if the customer pays both, two webhooks arrive and each one
       * legitimately settles its own payment row - crediting the wallet twice
       * for one order. Cheaper to refuse the second attempt than to reconcile
       * that afterwards.
       */
      const inFlight = await tx.one<{ id: string }>(
        `SELECT id FROM payments
          WHERE order_id = $1 AND status = 'pending' AND provider_ref IS NOT NULL`,
        [order.id],
      )
      if (inFlight) {
        throw new BusinessRuleError(
          'A payment for this order is already awaiting confirmation. Give it a moment, ' +
            'or cancel the order to start again.',
        )
      }

      const payment = await createPayment(tx, {
        orderId: order.id,
        payerUserId,
        method,
        amount: order.total,
        currency: order.currency,
      })

      await publish(
        {
          type: EVENT.PaymentInitiated,
          aggregateType: 'payment',
          aggregateId: payment.id,
          actorUserId: payerUserId,
          payload: { orderId: order.id, method, amount: order.total },
        },
        tx,
      )

      // The wallet never reaches a gateway: it is settled against our own
      // ledger, inside this transaction.
      if (method === 'wallet') {
        await markPayment(tx, payment.id, 'succeeded', {
          providerRef: `WALLET-${order.order_number}`,
        })
        await completeOrderPayment(tx, order, payment.id, payerUserId, method)
        return { order: await loadOrder(tx, order.id) }
      }

      const buyer = await tx.one<{ email: string | null; phone: string | null }>(
        `SELECT email, phone FROM users WHERE id = $1`,
        [payerUserId],
      )

      const charge = await gateway().charge({
        amount: order.total,
        currency: order.currency,
        method,
        /*
         * The payment row's id, not the order number. A retry after a failed
         * attempt is a new payment row, and so needs a new provider reference:
         * reusing the order number would collide on the provider's side and
         * leave one reference pointing at two attempts.
         */
        reference: payment.id,
        customer: { userId: payerUserId, email: buyer?.email, phone: buyer?.phone },
        metadata: { orderId: order.id, orderNumber: order.order_number },
      })

      if (charge.status === 'failed') {
        await markPayment(tx, payment.id, 'failed', {
          providerRef: charge.providerRef,
          failureReason: charge.failureReason,
        })
        await publish(
          {
            type: EVENT.PaymentFailed,
            aggregateType: 'payment',
            aggregateId: payment.id,
            actorUserId: payerUserId,
            payload: { orderId: order.id, reason: charge.failureReason },
          },
          tx,
        )
        throw new BusinessRuleError(charge.failureReason ?? 'Payment was declined')
      }

      if (charge.status === 'pending') {
        /*
         * The provider has accepted the attempt and nothing more. Record the
         * reference so the webhook can find this row, and stop: no deposit, no
         * escrow, no confirmation. The order keeps its reserved stock until it
         * is paid or the reservation expires.
         */
        await attachProviderRef(tx, payment.id, charge.providerRef)
        return {
          order: await loadOrder(tx, order.id),
          actionRequired: charge.actionRequired,
          awaitingProvider: true,
        }
      }

      // Synchronous success: this gateway settled inline.
      await markPayment(tx, payment.id, 'succeeded', { providerRef: charge.providerRef })
      await deposit('user', payerUserId, order.total, `Funding for order ${order.order_number}`, tx)
      await completeOrderPayment(tx, order, payment.id, payerUserId, method)

      return { order: await loadOrder(tx, order.id), actionRequired: charge.actionRequired }
    })

    return {
      ok: true,
      order: result.order,
      actionRequired: result.actionRequired,
      awaitingProvider: result.awaitingProvider,
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return { ok: false, error: 'Your wallet balance is not enough for this order' }
    }
    if (err instanceof InsufficientStockError) {
      return { ok: false, error: 'Some items sold out while you were checking out' }
    }
    if (err instanceof BusinessRuleError) return { ok: false, error: err.message }
    console.error('[orders] payment failed', err)
    return { ok: false, error: 'We could not complete that payment. Please try again.' }
  }
}

/**
 * Everything that happens once the money is genuinely ours.
 *
 * Extracted because it now has two callers that have to behave identically:
 * the synchronous path above, and the webhook settling an asynchronous
 * provider. Any divergence would mean an order paid by card ends up in a
 * different state than the same order paid from a wallet - a missing cashback,
 * an unreleased reservation, a seller never notified.
 *
 * The caller must already have credited the buyer's wallet, and must be inside
 * a transaction.
 */
async function completeOrderPayment(
  tx: Sql,
  order: Order,
  paymentId: string,
  payerUserId: string,
  method: PaymentMethod,
): Promise<void> {
  const buyerWallet = await ensureWallet('user', payerUserId, order.currency, tx)
  await payForOrder(tx, {
    buyerWalletId: buyerWallet.id,
    sellerOrgId: order.seller_org_id,
    orderId: order.id,
    orderNumber: order.order_number,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    total: order.total,
    platformFee: order.platform_fee,
  })

  // Payment succeeded: the reservation becomes a sale.
  await consumeReservations(order.id, tx)

  await tx.query(
    `UPDATE orders SET status = 'confirmed', payment_status = 'succeeded', confirmed_at = now()
      WHERE id = $1`,
    [order.id],
  )
  await logOrderEvent(tx, order.id, 'confirmed', 'Payment received', payerUserId)

  await publish(
    {
      type: EVENT.PaymentSucceeded,
      aggregateType: 'payment',
      aggregateId: paymentId,
      actorUserId: payerUserId,
      payload: { orderId: order.id, amount: order.total, method },
    },
    tx,
  )
  await publish(
    {
      type: EVENT.OrderConfirmed,
      aggregateType: 'order',
      aggregateId: order.id,
      actorUserId: payerUserId,
      payload: { orderNumber: order.order_number },
    },
    tx,
  )

  await notifySeller(
    tx,
    order,
    'Order paid',
    `Order ${order.order_number} is paid and ready to prepare.`,
  )
  await queueNotification(
    {
      userId: payerUserId,
      title: 'Payment successful',
      body: `Order ${order.order_number} is confirmed.`,
      category: 'order',
      referenceType: 'order',
      referenceId: order.id,
    },
    tx,
  )
}

// ---------------------------------------------------------------------------
// Asynchronous settlement - what a verified webhook calls
// ---------------------------------------------------------------------------

export type SettlementOutcome =
  'settled' | 'already_settled' | 'unknown_reference' | 'amount_mismatch' | 'order_not_payable'

/**
 * Identifies one delivery of one provider event.
 *
 * Claimed inside the settling transaction, never before it. Claiming in a
 * transaction of its own would let the process die between the claim and the
 * settlement, leaving an event marked handled that moved no money — and the
 * provider's retry, which is the only thing that would have fixed it, gets
 * turned away by the claim.
 */
export interface WebhookEventKey {
  provider: string
  id: string
  type: string
}

/**
 * Complete a payment the provider has confirmed it collected.
 *
 * `confirmed` is what the *provider* says it took, and it is checked against
 * what we asked for before any money moves. A payload claiming 100 kobo
 * against a 10,000,000 kobo order must not confirm that order, whether it got
 * there by tampering or by a provider-side mistake - the signature proves who
 * sent the message, not that the message is right.
 *
 * Safe to call repeatedly with one reference: the pending-row claim means
 * exactly one call does the work.
 */
export async function settlePaymentByProviderRef(
  providerRef: string,
  confirmed: { amount: number; currency: string },
  event?: WebhookEventKey,
): Promise<SettlementOutcome> {
  return withTx(async (tx) => {
    if (event && !(await claimWebhookEvent(tx, event.provider, event.id, event.type))) {
      return 'already_settled'
    }
    const payment = await findPaymentByProviderRef(tx, providerRef)
    if (!payment) return 'unknown_reference'
    if (payment.status !== 'pending') return 'already_settled'

    if (payment.amount !== confirmed.amount || payment.currency !== confirmed.currency) {
      await claimPendingPayment(tx, payment.id, 'failed', {
        failureReason: `Provider reported ${confirmed.amount} ${confirmed.currency}, expected ${payment.amount} ${payment.currency}`,
      })
      console.error(
        `[payments] amount mismatch on ${providerRef}: expected ${payment.amount} ${payment.currency}, provider said ${confirmed.amount} ${confirmed.currency}`,
      )
      return 'amount_mismatch'
    }

    /*
     * No order attached means a wallet top-up: the money is the point, not a
     * purchase. Credit the wallet the payment was raised against — which is
     * not always the payer's own, since someone topping up a business account
     * is funding the organisation, not themselves.
     */
    if (!payment.order_id) {
      const claimed = await claimPendingPayment(tx, payment.id, 'succeeded')
      if (!claimed) return 'already_settled'
      await deposit(
        payment.credit_owner_type ?? 'user',
        payment.credit_owner_id ?? payment.payer_user_id,
        payment.amount,
        'Wallet top-up',
        tx,
      )
      await queueNotification(
        {
          userId: payment.payer_user_id,
          title: 'Wallet topped up',
          body: 'Your top-up has been confirmed and added to your balance.',
          category: 'wallet',
          referenceType: 'payment',
          referenceId: payment.id,
        },
        tx,
      )
      return 'settled'
    }

    const order = await tx.one<Order>(`SELECT * FROM orders WHERE id = $1`, [payment.order_id])
    if (!order) return 'unknown_reference'

    /*
     * A customer who pays after cancelling, or after the reservation lapsed,
     * has given us money with no order left to put it against. Take the money
     * into their wallet and tell them, rather than confirming an order whose
     * stock is no longer held - the goods may genuinely be gone.
     */
    if (order.status !== 'pending_payment') {
      const claimed = await claimPendingPayment(tx, payment.id, 'succeeded')
      if (!claimed) return 'already_settled'
      await deposit(
        'user',
        payment.payer_user_id,
        payment.amount,
        `Payment for ${order.order_number}, received after the order was ${order.status}`,
        tx,
      )
      await queueNotification(
        {
          userId: payment.payer_user_id,
          title: 'Payment added to your wallet',
          body: `Order ${order.order_number} was already ${order.status}, so your payment went to your wallet balance instead.`,
          category: 'wallet',
          referenceType: 'order',
          referenceId: order.id,
        },
        tx,
      )
      return 'order_not_payable'
    }

    // The claim is the idempotency barrier: whoever wins it settles.
    const claimed = await claimPendingPayment(tx, payment.id, 'succeeded')
    if (!claimed) return 'already_settled'

    await deposit(
      'user',
      payment.payer_user_id,
      payment.amount,
      `Funding for order ${order.order_number}`,
      tx,
    )
    await completeOrderPayment(tx, order, payment.id, payment.payer_user_id, payment.method)
    return 'settled'
  })
}

/**
 * Record a provider-reported failure. The order stays in `pending_payment` so
 * the buyer can try again against the stock it still holds.
 */
export async function failPaymentByProviderRef(
  providerRef: string,
  reason: string,
  event?: WebhookEventKey,
): Promise<SettlementOutcome> {
  return withTx(async (tx) => {
    if (event && !(await claimWebhookEvent(tx, event.provider, event.id, event.type))) {
      return 'already_settled'
    }
    const payment = await findPaymentByProviderRef(tx, providerRef)
    if (!payment) return 'unknown_reference'

    const claimed = await claimPendingPayment(tx, payment.id, 'failed', { failureReason: reason })
    if (!claimed) return 'already_settled'

    await publish(
      {
        type: EVENT.PaymentFailed,
        aggregateType: 'payment',
        aggregateId: payment.id,
        actorUserId: payment.payer_user_id,
        payload: { orderId: payment.order_id, reason },
      },
      tx,
    )
    await queueNotification(
      {
        userId: payment.payer_user_id,
        title: 'Payment failed',
        body: reason,
        category: 'order',
        referenceType: 'order',
        referenceId: payment.order_id,
      },
      tx,
    )
    return 'settled'
  })
}

// ---------------------------------------------------------------------------
// Fulfilment transitions
// ---------------------------------------------------------------------------

const FORWARD: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  refunded: [],
}

export async function advanceOrder(
  orderId: string,
  next: OrderStatus,
  actorUserId: string,
  note?: string,
): Promise<OrderDetail> {
  return withTx(async (tx) => {
    const order = await tx.one<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId])
    if (!order) throw new BusinessRuleError('Order not found')
    if (!FORWARD[order.status].includes(next)) {
      throw new BusinessRuleError(`An order cannot move from ${order.status} to ${next}`)
    }

    const stamp: Partial<Record<string, string>> = {
      dispatched: 'dispatched_at',
      delivered: 'delivered_at',
      completed: 'completed_at',
    }
    const column = stamp[next]

    await tx.query(
      `UPDATE orders SET status = $2 ${column ? `, ${column} = now()` : ''} WHERE id = $1`,
      [orderId, next],
    )
    await logOrderEvent(tx, orderId, next, note ?? null, actorUserId)

    if (next === 'dispatched') {
      // Raise the delivery job in the same transaction, so an order cannot be
      // dispatched without work existing for a delivery partner to pick up.
      await requestDelivery(tx, {
        id: order.id,
        order_number: order.order_number,
        fulfilment: order.fulfilment,
        delivery_fee: order.delivery_fee,
        delivery_lat: order.delivery_lat,
        delivery_lng: order.delivery_lng,
        seller_org_id: order.seller_org_id,
      })

      await publish(
        { type: EVENT.OrderDispatched, aggregateType: 'order', aggregateId: orderId, actorUserId },
        tx,
      )
      await queueNotification(
        {
          userId: order.buyer_user_id,
          ...(order.fulfilment === 'pickup'
            ? {
                title: 'Your order is ready to collect',
                body: `Order ${order.order_number} is packed and waiting for you at the shop.`,
              }
            : {
                title: 'Your order is on the way',
                body: `Order ${order.order_number} has been dispatched.`,
              }),
          category: 'order',
          referenceType: 'order',
          referenceId: orderId,
        },
        tx,
      )
    }

    if (next === 'delivered') {
      // The seller confirmed delivery themselves, so any unclaimed job for
      // this order is stale work and comes off the rider board.
      await cancelOpenJob(tx, orderId)

      await publish(
        { type: EVENT.OrderDelivered, aggregateType: 'order', aggregateId: orderId, actorUserId },
        tx,
      )
      await queueNotification(
        {
          userId: order.buyer_user_id,
          ...(order.fulfilment === 'pickup'
            ? {
                title: 'Order collected',
                body: `Order ${order.order_number} was handed over. Confirm receipt to release payment${RATINGS_LAUNCHED ? ' and rate the seller' : ''}.`,
              }
            : {
                title: 'Order delivered',
                body: `Order ${order.order_number} was delivered.${RATINGS_LAUNCHED ? ' Tap to rate the seller.' : ''}`,
              }),
          category: 'order',
          referenceType: 'order',
          referenceId: orderId,
        },
        tx,
      )
    }

    if (next === 'completed') {
      // Escrow release: the seller can finally spend the proceeds for the goods.
      await releaseEscrow(
        order.seller_org_id,
        order.subtotal - order.platform_fee,
        order.order_number,
        tx,
      )

      // The delivery fee is settled separately. If a delivery partner carried
      // the order they were already paid on completion of their job; otherwise
      // the seller delivered it themselves and earns it.
      if (order.delivery_fee > 0 && !(await riderWasPaid(tx, orderId))) {
        await settleDeliveryToSeller(tx, {
          sellerOrgId: order.seller_org_id,
          deliveryFee: order.delivery_fee,
          orderNumber: order.order_number,
        })
      }

      // Loyalty cashback on the goods value (SAD wallet; "Earn rewards").
      const cashback = cashbackFor(order.subtotal)
      if (cashback > 0) {
        await payCashback(tx, {
          userId: order.buyer_user_id,
          amount: cashback,
          orderNumber: order.order_number,
        })
        await queueNotification(
          {
            userId: order.buyer_user_id,
            title: 'Cashback earned',
            body: `You earned cashback on order ${order.order_number}. It is in your wallet.`,
            category: 'reward',
            referenceType: 'order',
            referenceId: orderId,
          },
          tx,
        )
      }

      // Referral settlement. Whoever invited this buyer earns now, on a real
      // completed order - not when the buyer signed up (rewards module).
      await qualifyReferral(tx, {
        referredUserId: order.buyer_user_id,
        orderId: order.id,
        orderNumber: order.order_number,
        subtotal: order.subtotal,
      })

      await recomputeFulfilmentRate(tx, order.seller_org_id)
      await publish(
        {
          type: EVENT.OrderCompleted,
          aggregateType: 'order',
          aggregateId: orderId,
          actorUserId,
          payload: { orderNumber: order.order_number, total: order.total, cashback },
        },
        tx,
      )
      await notifySeller(
        tx,
        order,
        'Settlement released',
        `Funds for order ${order.order_number} are now available in your wallet.`,
      )
    }

    return loadOrder(tx, orderId)
  })
}

/** Buyer or seller cancellation. Releases stock, and refunds if already paid. */
export async function cancelOrder(
  orderId: string,
  actorUserId: string,
  reason: string,
): Promise<OrderDetail> {
  return withTx(async (tx) => {
    const order = await tx.one<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId])
    if (!order) throw new BusinessRuleError('Order not found')
    if (['delivered', 'completed', 'cancelled', 'refunded'].includes(order.status)) {
      throw new BusinessRuleError('This order can no longer be cancelled')
    }

    if (order.payment_status === 'succeeded') {
      // Paid already: reverse the money, then put the goods back.
      const buyerWallet = await ensureWallet('user', order.buyer_user_id, order.currency, tx)
      await refundToWallet(tx, {
        buyerWalletId: buyerWallet.id,
        sellerOrgId: order.seller_org_id,
        orderNumber: order.order_number,
        subtotal: order.subtotal,
        deliveryFee: order.delivery_fee,
        total: order.total,
        platformFee: order.platform_fee,
      })
      await cancelOpenJob(tx, orderId)
      const items = await tx.query<{ inventory_item_id: string; qty: number }>(
        `SELECT inventory_item_id, qty FROM order_items WHERE order_id = $1`,
        [orderId],
      )
      for (const item of items) {
        // Same transaction: the refund and the restock must both happen or
        // neither, or the seller loses money without getting the goods back.
        await returnStock(item.inventory_item_id, item.qty, orderId, actorUserId, tx)
      }
      await tx.query(
        `UPDATE orders SET status='refunded', payment_status='refunded', cancelled_at=now(), cancel_reason=$2
          WHERE id = $1`,
        [orderId, reason],
      )
      await logOrderEvent(tx, orderId, 'refunded', reason, actorUserId)
    } else {
      // Not paid: simply drop the holds.
      await releaseReservations(orderId, 'released', tx)
      await tx.query(
        `UPDATE orders SET status='cancelled', cancelled_at=now(), cancel_reason=$2 WHERE id = $1`,
        [orderId, reason],
      )
      await logOrderEvent(tx, orderId, 'cancelled', reason, actorUserId)
    }

    await publish(
      {
        type: EVENT.OrderCancelled,
        aggregateType: 'order',
        aggregateId: orderId,
        actorUserId,
        payload: { reason, wasPaid: order.payment_status === 'succeeded' },
      },
      tx,
    )
    await queueNotification(
      {
        userId: order.buyer_user_id,
        title: 'Order cancelled',
        body: `Order ${order.order_number} was cancelled. ${
          order.payment_status === 'succeeded' ? 'Your refund is in your wallet.' : ''
        }`,
        category: 'order',
        referenceType: 'order',
        referenceId: orderId,
      },
      tx,
    )

    return loadOrder(tx, orderId)
  })
}

// ---------------------------------------------------------------------------
// Ratings - "Ratings require verified transactions" (PRD §12)
// ---------------------------------------------------------------------------

export async function rateOrder(
  orderId: string,
  raterUserId: string,
  stars: number,
  comment?: string | null,
): Promise<void> {
  if (stars < 1 || stars > 5) throw new BusinessRuleError('Rating must be between 1 and 5')

  await withTx(async (tx) => {
    const order = await tx.one<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId])
    if (!order) throw new BusinessRuleError('Order not found')
    if (order.buyer_user_id !== raterUserId) throw new BusinessRuleError('This is not your order')
    // The verified-transaction rule: you can only rate what you actually received.
    if (!['delivered', 'completed'].includes(order.status)) {
      throw new BusinessRuleError('You can only rate an order once it has been delivered')
    }

    const existing = await tx.one<{ id: string }>(`SELECT id FROM ratings WHERE order_id = $1`, [
      orderId,
    ])
    if (existing) throw new BusinessRuleError('You have already rated this order')

    await tx.query(
      `INSERT INTO ratings (order_id, rater_user_id, organisation_id, stars, comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [orderId, raterUserId, order.seller_org_id, stars, comment ?? null],
    )

    // Recompute the seller's aggregate from verified ratings only.
    await tx.query(
      `UPDATE organisations o
          SET rating = sub.avg_stars, rating_count = sub.n
         FROM (
           SELECT organisation_id, ROUND(AVG(stars)::numeric, 2) AS avg_stars, COUNT(*)::int AS n
             FROM ratings WHERE organisation_id = $1 GROUP BY organisation_id
         ) sub
        WHERE o.id = sub.organisation_id`,
      [order.seller_org_id],
    )

    await publish(
      {
        type: EVENT.RatingSubmitted,
        aggregateType: 'organisation',
        aggregateId: order.seller_org_id,
        actorUserId: raterUserId,
        payload: { orderId, stars },
      },
      tx,
    )
  })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function loadOrder(sql: Sql, orderId: string): Promise<OrderDetail> {
  const order = await sql.one<OrderDetail>(
    `SELECT o.*,
            s.name AS seller_name, s.slug AS seller_slug, s.phone AS seller_phone,
            s.address AS seller_address, s.logo_url AS seller_logo,
            u.full_name AS buyer_name, u.phone AS buyer_phone,
            bo.name AS buyer_org_name,
            r.stars AS rating_stars
       FROM orders o
       JOIN organisations s ON s.id = o.seller_org_id
       JOIN users u         ON u.id = o.buyer_user_id
       LEFT JOIN organisations bo ON bo.id = o.buyer_org_id
       LEFT JOIN ratings r  ON r.order_id = o.id
      WHERE o.id = $1`,
    [orderId],
  )
  if (!order) throw new BusinessRuleError('Order not found')

  order.items = await sql.query<OrderLine>(
    `SELECT id, product_id, inventory_item_id, name_snapshot, image_snapshot,
            unit_price, qty, line_total
       FROM order_items WHERE order_id = $1`,
    [orderId],
  )
  return order
}

export async function getOrder(orderId: string): Promise<OrderDetail | null> {
  const sql = await getSql()
  try {
    return await loadOrder(sql, orderId)
  } catch {
    return null
  }
}

export async function orderTimeline(orderId: string) {
  const sql = await getSql()
  return sql.query<{ status: OrderStatus; note: string | null; created_at: Date }>(
    `SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY id ASC`,
    [orderId],
  )
}

export interface OrderSummary extends Order {
  seller_name: string
  seller_slug: string
  buyer_name: string
  buyer_org_name: string | null
  item_count: number
  first_item: string | null
  first_image: string | null
}

const SUMMARY_SELECT = `
  SELECT o.*, s.name AS seller_name, s.slug AS seller_slug,
         u.full_name AS buyer_name, bo.name AS buyer_org_name,
         (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT oi.name_snapshot  FROM order_items oi WHERE oi.order_id = o.id LIMIT 1) AS first_item,
         (SELECT oi.image_snapshot FROM order_items oi WHERE oi.order_id = o.id LIMIT 1) AS first_image
    FROM orders o
    JOIN organisations s ON s.id = o.seller_org_id
    JOIN users u         ON u.id = o.buyer_user_id
    LEFT JOIN organisations bo ON bo.id = o.buyer_org_id
`

/** A buyer's purchase history. */
export async function ordersForBuyer(userId: string, limit = 40): Promise<OrderSummary[]> {
  const sql = await getSql()
  return sql.query<OrderSummary>(
    `${SUMMARY_SELECT} WHERE o.buyer_user_id = $1 ORDER BY o.placed_at DESC LIMIT $2`,
    [userId, limit],
  )
}

/** Procurement history for a business (orders it placed upstream). */
export async function ordersForBuyerOrg(orgId: string, limit = 40): Promise<OrderSummary[]> {
  const sql = await getSql()
  return sql.query<OrderSummary>(
    `${SUMMARY_SELECT} WHERE o.buyer_org_id = $1 ORDER BY o.placed_at DESC LIMIT $2`,
    [orgId, limit],
  )
}

/** Incoming orders for a seller. */
export async function ordersForSeller(
  orgId: string,
  opts: { status?: OrderStatus; limit?: number } = {},
): Promise<OrderSummary[]> {
  const sql = await getSql()
  const params: unknown[] = [orgId]
  let where = `o.seller_org_id = $1`
  if (opts.status) {
    params.push(opts.status)
    where += ` AND o.status = $${params.length}`
  }
  params.push(opts.limit ?? 40)
  return sql.query<OrderSummary>(
    `${SUMMARY_SELECT} WHERE ${where} ORDER BY o.placed_at DESC LIMIT $${params.length}`,
    params,
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logOrderEvent(
  sql: Sql,
  orderId: string,
  status: OrderStatus,
  note: string | null,
  actorUserId: string | null,
) {
  await sql.query(
    `INSERT INTO order_events (order_id, status, note, actor_user_id) VALUES ($1,$2,$3,$4)`,
    [orderId, status, note, actorUserId],
  )
}

async function notifySeller(sql: Sql, order: Order, title: string, body: string) {
  const owner = await sql.one<{ owner_user_id: string | null }>(
    `SELECT owner_user_id FROM organisations WHERE id = $1`,
    [order.seller_org_id],
  )
  if (owner?.owner_user_id) {
    await queueNotification(
      {
        userId: owner.owner_user_id,
        title,
        body,
        category: 'order',
        referenceType: 'order',
        referenceId: order.id,
      },
      sql,
    )
  }
}

/** Fulfilment reliability feeds the B2B ranking models. */
async function recomputeFulfilmentRate(sql: Sql, orgId: string) {
  await sql.query(
    `UPDATE organisations o
        SET fulfilment_rate = sub.rate
       FROM (
         SELECT seller_org_id,
                ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('delivered','completed'))
                      / NULLIF(COUNT(*) FILTER (WHERE status <> 'pending_payment'), 0), 2) AS rate
           FROM orders WHERE seller_org_id = $1 GROUP BY seller_org_id
       ) sub
      WHERE o.id = sub.seller_org_id AND sub.rate IS NOT NULL`,
    [orgId],
  )
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  preparing: 'Being prepared',
  dispatched: 'On the way',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

/**
 * A collection order moves through the same states as a delivery - the shop
 * marks it ready (`dispatched`) and handed over (`delivered`) - but nothing is
 * on the way and no one delivers it, so those two read differently.
 */
const PICKUP_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  dispatched: 'Ready to collect',
  delivered: 'Collected',
}

export function orderStatusLabel(status: OrderStatus, fulfilment: Order['fulfilment']): string {
  return (fulfilment === 'pickup' && PICKUP_STATUS_LABEL[status]) || ORDER_STATUS_LABEL[status]
}
