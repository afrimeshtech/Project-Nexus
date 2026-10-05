import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { OrderStatusBadge } from '@/components/commerce/OrderBits'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Card, EmptyState, PageHeader, Stat } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { deliveryLaunched } from '@/lib/launch-fulfilment'
import { RANKING_LAUNCHED } from '@/lib/launch-ranking'
import { ordersForBuyerOrg, ordersForSeller, type OrderStatus } from '@/modules/orders/service'
import { sellerKpis } from '@/modules/analytics/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders' }

const FILTERS: { key: string; label: string; status?: OrderStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'confirmed', label: 'To prepare', status: 'confirmed' },
  { key: 'preparing', label: 'Preparing', status: 'preparing' },
  // FUTURE-DELIVERY: the same two states, named for collection while that is
  // the only way an order leaves the shop.
  {
    key: 'dispatched',
    label: deliveryLaunched() ? 'On the way' : 'Ready to collect',
    status: 'dispatched',
  },
  { key: 'delivered', label: deliveryLaunched() ? 'Delivered' : 'Collected', status: 'delivered' },
  { key: 'completed', label: 'Completed', status: 'completed' },
]

export default async function PartnerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>
}) {
  const params = await searchParams
  await requireUser('/partner/orders')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const showPurchases = params.view === 'purchases'
  const filter = FILTERS.find((f) => f.key === (params.status ?? 'all')) ?? FILTERS[0]

  const [orders, kpis] = await Promise.all([
    showPurchases
      ? ordersForBuyerOrg(org.id, 60)
      : ordersForSeller(org.id, { status: filter.status, limit: 60 }),
    sellerKpis(org.id),
  ])

  return (
    <PartnerShell active="/partner/orders">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Orders' }]}
          title={showPurchases ? 'Your purchases' : 'Incoming orders'}
          subtitle={
            showPurchases
              ? 'Stock you have sourced from the tier above you'
              : 'Orders placed with you by buyers'
          }
        />

        <div
          className={`grid grid-cols-2 gap-4 ${RANKING_LAUNCHED ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
        >
          <Stat label="Open orders" value={kpis.orders_open} />
          <Stat label="Orders (30 days)" value={kpis.orders_30d} />
          <Stat label="Average order" value={formatMoney(kpis.aov)} />
          {/* FUTURE-RANKING: fulfilment rate is a ranking input, shown with ranking. */}
          {RANKING_LAUNCHED && (
            <Stat
              label="Fulfilment rate"
              value={`${Number(kpis.fulfilment_rate).toFixed(0)}%`}
              hint="Orders you fulfil out of those you accept"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/partner/orders"
            className={`rounded-full px-3.5 py-2 text-xs font-medium ${
              !showPurchases
                ? 'bg-accent-500 text-accent-ink'
                : 'border border-line bg-surface text-muted'
            }`}
          >
            Sales
          </Link>
          {/* FUTURE-DASHBOARD: the purchases side of the ledger. A retail outlet
              buys from merchants, and that tier is not open yet, so this tab can
              only ever be empty. Everything behind it — the ?view=purchases
              branch below, the queries, the order service — is untouched.

              <Link
                href="/partner/orders?view=purchases"
                className={`rounded-full px-3.5 py-2 text-xs font-medium ${
                  showPurchases
                    ? 'bg-accent-500 text-accent-ink'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                Purchases
              </Link>
          */}

          {!showPurchases && (
            <>
              <span className="mx-1 h-4 w-px bg-surface-strong" />
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === 'all' ? '/partner/orders' : `/partner/orders?status=${f.key}`}
                  className={`rounded-full px-3.5 py-2 text-xs font-medium ${
                    filter.key === f.key
                      ? 'bg-surface-deep text-white'
                      : 'border border-line bg-surface text-muted'
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </>
          )}
        </div>

        {orders.length ? (
          <div className="space-y-2">
            {orders.map((order) => (
              <Link key={order.id} href={`/partner/orders/${order.id}`} className="block min-w-0">
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
                    <p className="truncate text-xs text-muted">
                      {showPurchases
                        ? `from ${order.seller_name}`
                        : `for ${order.buyer_org_name ?? order.buyer_name}`}{' '}
                      ·{' '}
                      {new Date(order.placed_at).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-ink">
                      {formatMoney(
                        showPurchases ? order.total : order.total - order.platform_fee,
                        order.currency,
                      )}
                    </p>
                    {!showPurchases && <p className="text-xs text-muted">after fees</p>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="inbox"
            title={showPurchases ? 'No purchases yet' : 'No orders here'}
            body={
              showPurchases
                ? 'Restock from the tier above you and your purchases will appear here.'
                : 'Orders placed with you will appear here as soon as buyers check out.'
            }
          />
        )}
      </div>
    </PartnerShell>
  )
}
