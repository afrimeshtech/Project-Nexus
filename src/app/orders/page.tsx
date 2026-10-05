import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { OrderStatusBadge } from '@/components/commerce/OrderBits'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Card, EmptyState, LinkButton, PageHeader, Stat } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { formatDistance } from '@/lib/geo'
import { ordersForBuyer } from '@/modules/orders/service'
import { consumerKpis } from '@/modules/analytics/service'

export const dynamic = 'force-dynamic'

/** Purchase history (PRD Consumer Module). */
export default async function OrdersPage() {
  const user = await requireUser('/orders')
  const [orders, kpis] = await Promise.all([ordersForBuyer(user.id), consumerKpis(user.id)])

  return (
    <ConsumerShell search={false}>
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Orders' }]}
          title="Your orders"
          subtitle="Everything you have bought on AfriMesh"
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Orders" value={kpis.orders} />
          <Stat label="Total spent" value={formatMoney(kpis.spent)} />
          <Stat label="Repeat sellers" value={kpis.repeat_sellers} />
          <Stat
            label="Average distance"
            value={formatDistance(Number(kpis.avg_distance))}
            hint="How far your goods travel"
          />
        </div>

        {orders.length ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="block min-w-0">
                <Card className="flex items-center gap-3 card-interactive hover:card-interactive-hover">
                  <ProductThumb
                    name={order.first_item ?? 'Order'}
                    imageUrl={order.first_image}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-technical text-xs text-muted">
                        {order.order_number}
                      </span>
                      <OrderStatusBadge status={order.status} fulfilment={order.fulfilment} />
                    </div>
                    <p className="mt-0.5 truncate font-medium text-ink">
                      {order.first_item}
                      {order.item_count > 1 && ` + ${order.item_count - 1} more`}
                    </p>
                    <p className="text-xs text-muted">
                      {order.seller_name} ·{' '}
                      {new Date(order.placed_at).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-ink">
                    {formatMoney(order.total, order.currency)}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="box"
            title="No orders yet"
            body="When you buy something, it will appear here with live tracking."
            action={<LinkButton href="/search">Find something nearby</LinkButton>}
          />
        )}
      </div>
    </ConsumerShell>
  )
}
