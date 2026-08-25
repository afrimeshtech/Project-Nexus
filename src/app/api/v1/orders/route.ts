import { endpoint, pageSize, ApiError } from '@/app/api/v1/_handler'
import { ordersForSeller } from '@/modules/orders/service'
import type { OrderStatus } from '@/modules/orders/service'

export const dynamic = 'force-dynamic'

const STATUSES = [
  'pending_payment',
  'confirmed',
  'preparing',
  'dispatched',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
] as const

/**
 * GET /api/v1/orders — orders placed with the calling business.
 *
 * This is the endpoint an ERP or accounting integration polls, so the status
 * filter is validated against the real enum: passing an unknown status must
 * be an explicit 400 rather than an empty list that reads as "no orders" and
 * quietly under-reports someone's revenue.
 */
export const GET = endpoint('orders:read', async ({ organisationId, searchParams }) => {
  const status = searchParams.get('status')
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(
      400,
      'invalid_status',
      `Unknown status "${status}". Valid values: ${STATUSES.join(', ')}.`,
    )
  }

  const orders = await ordersForSeller(organisationId, {
    status: (status as OrderStatus) ?? undefined,
    limit: pageSize(searchParams),
  })

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    buyer: {
      name: order.buyer_org_name ?? order.buyer_name,
      isBusiness: Boolean(order.buyer_org_name),
    },
    totals: {
      currency: order.currency,
      subtotalMinor: order.subtotal,
      deliveryFeeMinor: order.delivery_fee,
      platformFeeMinor: order.platform_fee,
      totalMinor: order.total,
    },
    itemCount: order.item_count,
    fulfilment: order.fulfilment,
    placedAt: order.placed_at,
  }))
})
