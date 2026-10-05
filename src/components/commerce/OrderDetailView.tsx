import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { OrderProgress, OrderStatusBadge } from '@/components/commerce/OrderBits'
import {
  AdvanceOrderButton,
  CancelOrderForm,
  DispatchForm,
  RateOrderForm,
  RetryPaymentForm,
} from '@/components/commerce/OrderActions'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { Alert, Badge, Card, Rating, SectionHeading } from '@/components/ui'
import { formatMoney } from '@/lib/money'
import { formatDistance, formatEta } from '@/lib/geo'
import { orderStatusLabel, orderTimeline, type OrderDetail } from '@/modules/orders/service'
import { deliveryForOrder, type RiderOption } from '@/modules/logistics/service'
import { cashbackFor } from '@/lib/money'

/**
 * The order, rendered identically for whoever is looking at it - only the
 * available actions differ. Buyer and seller see the same facts, which is the
 * point: a shared record neither side can quietly reinterpret.
 */
export async function OrderDetailView({
  order,
  viewer,
  payment,
  riders,
}: {
  order: OrderDetail
  /**
   * `canSeeFunds` is false for a seller's sales rep: they see what the buyer
   * pays, not what the business nets after fees.
   */
  viewer: { isBuyer: boolean; isSeller: boolean; canSeeFunds?: boolean }
  payment?: { status?: string; reason?: string }
  /** Riders the seller may dispatch to. Absent when the viewer cannot dispatch. */
  riders?: RiderOption[]
}) {
  const [timeline, delivery] = await Promise.all([
    orderTimeline(order.id),
    deliveryForOrder(order.id),
  ])
  const sellerNet = viewer.isSeller && viewer.canSeeFunds !== false
  const canDispatch = viewer.isSeller && riders !== undefined && order.fulfilment === 'delivery'
  const awaitingRider =
    canDispatch && order.status === 'dispatched' && delivery?.status === 'unassigned'
  const canCancel = !['delivered', 'completed', 'cancelled', 'refunded'].includes(order.status)
  const pendingCashback = cashbackFor(order.subtotal)
  const pickup = order.fulfilment === 'pickup'

  return (
    <div className="space-y-7">
      {payment?.status === 'success' && (
        <Alert tone="success">Payment received — the order is confirmed.</Alert>
      )}
      {payment?.status === 'failed' && (
        <Alert tone="danger">
          {payment.reason || 'That payment did not go through.'} The items stay reserved for a short
          while — you can try again below.
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-technical text-sm text-muted">{order.order_number}</p>
          <h1 className="text-xl font-semibold text-ink">
            {orderStatusLabel(order.status, order.fulfilment)}
          </h1>
        </div>
        <OrderStatusBadge status={order.status} fulfilment={order.fulfilment} />
      </div>

      <Card>
        <OrderProgress status={order.status} fulfilment={order.fulfilment} />
      </Card>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card>
            <SectionHeading title="Items" />
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <ProductThumb
                    name={item.name_snapshot}
                    imageUrl={item.image_snapshot}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{item.name_snapshot}</p>
                    <p className="text-xs text-muted">
                      {item.qty} × {formatMoney(item.unit_price, order.currency)}
                    </p>
                  </div>
                  <p className="font-medium text-ink">
                    {formatMoney(item.line_total, order.currency)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {delivery && delivery.status !== 'failed' && (
            <Card>
              <SectionHeading
                title="Delivery"
                subtitle={
                  delivery.rider_user_id
                    ? `${delivery.rider_name ?? 'A delivery partner'} is handling this order`
                    : 'Waiting for a delivery partner to accept'
                }
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Badge
                  tone={
                    delivery.status === 'delivered'
                      ? 'success'
                      : delivery.status === 'unassigned'
                        ? 'warning'
                        : 'brand'
                  }
                >
                  {DELIVERY_LABEL[delivery.status] ?? delivery.status}
                </Badge>
                <span className="text-muted">
                  {formatDistance(Number(delivery.distance_km))} trip ·{' '}
                  {formatEta(delivery.eta_minutes)}
                </span>
                {delivery.proof_note && (
                  <span className="text-muted">Received by {delivery.proof_note}</span>
                )}
                {viewer.isSeller && delivery.rider_phone && delivery.status !== 'delivered' && (
                  <a
                    href={`tel:${delivery.rider_phone}`}
                    className="font-medium text-accent-strong"
                  >
                    Call rider
                  </a>
                )}
              </div>
            </Card>
          )}

          <Card>
            <SectionHeading title="Timeline" />
            <ol className="space-y-3">
              {timeline.map((entry, index) => (
                <li key={index} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-500" />
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {orderStatusLabel(entry.status, order.fulfilment)}
                    </p>
                    {entry.note && <p className="text-xs text-muted">{entry.note}</p>}
                    <p className="font-technical text-xs text-muted">
                      {new Date(entry.created_at).toLocaleString('en-NG')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {viewer.isBuyer && ['delivered', 'completed'].includes(order.status) && (
            <Card>
              <SectionHeading title="Rate this seller" />
              {order.rating_stars ? (
                <div className="flex items-center gap-2">
                  <Rating value={order.rating_stars} />
                  <span className="text-sm text-muted">You already rated this order.</span>
                </div>
              ) : (
                <RateOrderForm orderId={order.id} />
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionHeading title="Summary" />
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
              {pickup ? (
                <Row label="Collection" value="Free" />
              ) : (
                <Row label="Delivery" value={formatMoney(order.delivery_fee, order.currency)} />
              )}
              {sellerNet && (
                <Row
                  label="Platform fee"
                  value={`− ${formatMoney(order.platform_fee, order.currency)}`}
                />
              )}
              <div className="border-t border-line-soft pt-2">
                <Row
                  label={sellerNet ? 'You receive' : 'Total'}
                  value={formatMoney(
                    sellerNet ? order.total - order.platform_fee : order.total,
                    order.currency,
                  )}
                  bold
                />
              </div>
            </dl>
            {['confirmed', 'preparing', 'dispatched', 'delivered'].includes(order.status) && (
              <p className="mt-3 rounded-brand bg-accent-soft px-3 py-2 text-xs text-accent-strong">
                {pickup
                  ? 'Held in escrow. Released to the seller when the buyer confirms collection.'
                  : 'Held in escrow. Released to the seller when the buyer confirms delivery.'}
              </p>
            )}
            {viewer.isBuyer && pendingCashback > 0 && order.status !== 'completed' && (
              <p className="mt-2 rounded-brand bg-accent-soft px-3 py-2 text-xs text-accent-strong">
                Earn {formatMoney(pendingCashback, order.currency)} cashback when you confirm
                receipt.
              </p>
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Questions?"
              subtitle={
                viewer.isBuyer
                  ? 'Message the seller about this order'
                  : 'Message the buyer about this order'
              }
            />
            <Link
              href={`/messages/${order.id}`}
              className="inline-flex items-center gap-2 rounded-brand border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
            >
              <Icon name="chat" size={16} /> Open conversation
            </Link>
          </Card>

          <Card>
            <SectionHeading title={viewer.isBuyer ? 'Seller' : 'Buyer'} />
            {viewer.isBuyer ? (
              <div className="flex items-center gap-3">
                <SellerThumb name={order.seller_name} logoUrl={order.seller_logo} size="sm" />
                <div className="min-w-0">
                  <Link
                    href={`/shop/${order.seller_slug}`}
                    className="block truncate font-medium text-ink hover:text-accent-strong"
                  >
                    {order.seller_name}
                  </Link>
                  <p className="truncate text-xs text-muted">{order.seller_address}</p>
                  {order.seller_phone && (
                    <a
                      href={`tel:${order.seller_phone}`}
                      className="text-xs font-medium text-accent-strong"
                    >
                      {order.seller_phone}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p className="font-medium text-ink">{order.buyer_org_name ?? order.buyer_name}</p>
                {order.buyer_phone && (
                  <a
                    href={`tel:${order.buyer_phone}`}
                    className="text-xs font-medium text-accent-strong"
                  >
                    {order.buyer_phone}
                  </a>
                )}
              </div>
            )}

            <div className="mt-3 space-y-1.5 border-t border-line-soft pt-3 text-xs text-muted">
              {/* A collection order's delivery_address is where the buyer was when
                  they ordered; where they collect from is the shop. */}
              <p>
                {pickup ? 'Collect from' : 'Deliver to'}:{' '}
                <span className="text-ink">
                  {pickup ? (order.seller_address ?? order.seller_name) : order.delivery_address}
                </span>
              </p>
              <p>
                {pickup
                  ? `${formatDistance(Number(order.distance_km))} from the buyer`
                  : `${formatDistance(Number(order.distance_km))} · about ${formatEta(order.eta_minutes)}`}
              </p>
              {order.buyer_tier < 5 && (
                <Badge tone="info">
                  B2B restock · tier {order.buyer_tier} buying from tier {order.seller_tier}
                </Badge>
              )}
            </div>
          </Card>

          {order.status === 'pending_payment' && viewer.isBuyer && (
            <Card>
              <SectionHeading title="Complete payment" />
              <RetryPaymentForm orderId={order.id} />
            </Card>
          )}

          <Card className="space-y-3">
            <SectionHeading title="Actions" />
            <div className="flex flex-wrap gap-2">
              {viewer.isSeller && order.status === 'confirmed' && (
                <AdvanceOrderButton orderId={order.id} next="preparing" label="Start preparing" />
              )}
              {viewer.isSeller &&
                order.status === 'preparing' &&
                (canDispatch ? (
                  <DispatchForm orderId={order.id} riders={riders ?? []} />
                ) : (
                  <AdvanceOrderButton
                    orderId={order.id}
                    next="dispatched"
                    label={pickup ? 'Mark ready to collect' : 'Mark dispatched'}
                  />
                ))}
              {awaitingRider && (
                <DispatchForm orderId={order.id} riders={riders ?? []} assignOnly />
              )}
              {viewer.isSeller && order.status === 'dispatched' && (
                <AdvanceOrderButton
                  orderId={order.id}
                  next="delivered"
                  label={pickup ? 'Mark collected' : 'Mark delivered'}
                />
              )}
              {viewer.isBuyer && order.status === 'delivered' && (
                <AdvanceOrderButton
                  orderId={order.id}
                  next="completed"
                  label={
                    pickup
                      ? 'Confirm collection & release payment'
                      : 'Confirm receipt & release payment'
                  }
                />
              )}
            </div>
            {canCancel && <CancelOrderForm orderId={order.id} />}
            {!canCancel &&
              !['confirmed', 'preparing', 'dispatched', 'delivered', 'pending_payment'].includes(
                order.status,
              ) && <p className="text-sm text-muted">This order is closed.</p>}
          </Card>
        </aside>
      </div>
    </div>
  )
}

const DELIVERY_LABEL: Record<string, string> = {
  unassigned: 'Looking for a rider',
  assigned: 'Rider heading to the shop',
  picked_up: 'Collected — on the way',
  in_transit: 'On the way',
  delivered: 'Delivered',
  failed: 'Not needed',
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={bold ? 'text-base font-bold text-ink' : 'font-medium text-ink'}>{value}</dd>
    </div>
  )
}
