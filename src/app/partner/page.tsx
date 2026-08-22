import Link from 'next/link'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { OrderStatusBadge } from '@/components/commerce/OrderBits'
import { BarSeries } from '@/components/charts/BarSeries'
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  // FUTURE-DASHBOARD: LinkButton, for the sourcing shortcut below.
  Rating,
  SectionHeading,
  Stat,
} from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatMoney } from '@/lib/money'
import { ORG_LABEL, type OrgType } from '@/lib/tiers'
// FUTURE-DASHBOARD: import { ORG_LABEL, supplierTypeFor, type OrgType } from '@/lib/tiers'
import {
  sellerKpis,
  sellerSalesSeries,
  topSellingProducts,
  unmetDemand,
} from '@/modules/analytics/service'
import { inventoryStats, listInventory, expiringBatches } from '@/modules/inventory/service'
import { ordersForSeller } from '@/modules/orders/service'
import { getBalance } from '@/modules/wallet/service'
import { pointsBalance, referralSummary } from '@/modules/rewards/service'
import { audienceForSeller } from '@/modules/territory/service'
import { ActivityPanel } from '@/components/territory/ActivityPanel'
import { formatPoints } from '@/lib/points'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard' }

/**
 * Business overview. The same page serves an outlet, a merchant and a dealer
 * warehouse - what changes is who they sell to and who they source from.
 */
export default async function PartnerHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  const user = await requireUser('/partner')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const [kpis, stock, series, top, orders, wallet, lowStock, expiring, demand, points, referrals] =
    await Promise.all([
      sellerKpis(org.id),
      inventoryStats(org.id),
      sellerSalesSeries(org.id, 14),
      topSellingProducts(org.id, 5),
      ordersForSeller(org.id, { limit: 6 }),
      getBalance('organisation', org.id),
      listInventory(org.id, { lowOnly: true, limit: 6 }),
      expiringBatches(org.id, 60),
      unmetDemand(org.id, 5),
      pointsBalance('organisation', org.id),
      referralSummary(user.id),
    ])

  // FUTURE-DASHBOARD: which tier this organisation restocks from. A retail
  // outlet sources from merchants, and that tier is not open yet, so there is
  // nowhere for the "Source now" action below to lead.
  // const supplier = supplierTypeFor(org.tier_level)
  const audience = audienceForSeller(org.type)

  /* Headline figures for the sales panel.
     Summed from the series already fetched rather than queried again — the
     rows carry both revenue and order count, so a second round trip would be
     asking the database something it has already answered. */
  const sales14d = series.reduce(
    (total, row) => ({
      orders: total.orders + Number(row.orders),
      revenue: total.revenue + Number(row.revenue),
    }),
    { orders: 0, revenue: 0 },
  )

  return (
    <PartnerShell active="/partner">
      <div className="space-y-8">
        {welcome && (
          <Alert tone="success">
            Your business is registered. Add your stock, and your listings go live to nearby buyers
            as soon as verification completes.
          </Alert>
        )}

        <div>
          <h1 className="text-xl font-semibold text-ink">{org.name}</h1>
          <p className="text-sm text-muted">
            {ORG_LABEL[org.type as OrgType]} · {org.city ?? '—'} · serves{' '}
            {Number(org.delivery_radius_km).toFixed(0)} km
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Revenue (30 days)" value={formatMoney(kpis.revenue_30d)} />
          <Stat
            label="Open orders"
            value={kpis.orders_open}
            hint={`${kpis.orders_30d} in 30 days`}
          />
          <Stat
            label="Wallet available"
            value={formatMoney(wallet.available)}
            hint={`${formatMoney(wallet.locked)} in escrow`}
          />
          <Stat
            label="Rating"
            value={<Rating value={kpis.rating} count={kpis.rating_count} />}
            hint={`Fulfils ${Number(kpis.fulfilment_rate).toFixed(0)}% of orders`}
          />
          <Stat
            label="Reward points"
            value={formatPoints(points.available)}
            hint={
              referrals.rewarded
                ? `${referrals.rewarded} referral${referrals.rewarded === 1 ? '' : 's'} · worth ${formatMoney(points.redeemableValue)}`
                : `Worth ${formatMoney(points.redeemableValue)}`
            }
            icon="star-filled"
          />
          <Stat
            label="Invitations pending"
            value={referrals.pending}
            hint="Businesses you invited that have not ordered yet"
            icon="user"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card>
            <SectionHeading title="Sales, last 14 days" subtitle="Net of platform fees" />
            {/* The period totals, above the chart.
                A bar chart answers "which days" well and "how much altogether"
                not at all — the reader was left estimating a fortnight's takings
                by eye. These are the two numbers they were estimating. No trend
                arrow: that needs the previous fortnight to compare against, and
                an arrow drawn without one would be decoration asserting a fact
                nothing here has checked. */}
            <div className="mb-5 flex flex-wrap gap-x-10 gap-y-3 border-b border-line-soft pb-4">
              <div>
                <p className="font-technical text-eyebrow uppercase text-muted">Orders</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {sales14d.orders}
                </p>
              </div>
              <div>
                <p className="font-technical text-eyebrow uppercase text-muted">Revenue</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {formatMoney(sales14d.revenue)}
                </p>
              </div>
            </div>
            <BarSeries
              data={series}
              valueKey="revenue"
              caption="Daily revenue over the last 14 days"
              emptyLabel="No sales in the last 14 days"
            />
          </Card>

          <Card>
            <SectionHeading title="Stock position" />
            <dl className="space-y-2 text-sm">
              <Line label="Products listed" value={String(stock.skus)} />
              <Line label="Units available" value={stock.units_available.toLocaleString()} />
              <Line label="Reserved for orders" value={stock.units_reserved.toLocaleString()} />
              <Line
                label="Low stock"
                value={String(stock.low_stock)}
                tone={stock.low_stock ? 'warn' : undefined}
              />
              <Line
                label="Out of stock"
                value={String(stock.out_of_stock)}
                tone={stock.out_of_stock ? 'warn' : undefined}
              />
              <Line label="Stock value" value={formatMoney(stock.stock_value)} />
              <Line label="Inventory turnover" value={String(kpis.inventory_turnover)} />
            </dl>
          </Card>
        </div>

        {/* High on the page, not buried at the bottom: where the demand is
            drives the restocking decisions in every section below it. */}
        {audience && (
          <ActivityPanel
            audience={audience}
            title="Where your buyers are"
            subtitle={`The busiest neighbourhoods within reach of ${org.name}`}
            origin={{ lat: org.lat, lng: org.lng }}
            originLabel={org.name}
            radiusKm={Math.max(Math.round(Number(org.delivery_radius_km) * 2.5), 10)}
            ownOrgId={org.id}
            days={90}
            limit={5}
            moreHref="/partner/locations"
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeading
              title="Recent orders"
              action={
                <Link
                  href="/partner/orders"
                  className="text-sm font-medium text-accent-500 hover:underline"
                >
                  All orders
                </Link>
              }
            />
            {orders.length ? (
              <ul className="space-y-2">
                {orders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/partner/orders/${order.id}`}
                      className="flex items-center justify-between gap-3 rounded-brand px-2 py-2 hover:bg-surface-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {order.first_item}
                          {order.item_count > 1 && ` +${order.item_count - 1}`}
                        </span>
                        <span className="block font-technical text-xs text-muted">
                          {order.order_number} · {order.buyer_org_name ?? order.buyer_name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <OrderStatusBadge status={order.status} />
                        <span className="text-sm font-semibold">{formatMoney(order.total)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="inbox"
                title="No orders yet"
                body="They will appear here as buyers order."
              />
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <SectionHeading
                title="Needs restocking"
                subtitle="At or below your reorder level"
                // FUTURE-DASHBOARD: the sourcing shortcut, restored with the
                // merchant tier —
                //   action={
                //     supplier ? (
                //       <LinkButton href="/partner/source" variant="ghost">
                //         Source now
                //       </LinkButton>
                //     ) : null
                //   }
              />
              {lowStock.length ? (
                <ul className="space-y-1.5">
                  {lowStock.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link
                        href={`/partner/inventory/${item.id}`}
                        className="truncate text-ink hover:text-accent-400"
                      >
                        {item.product_name}
                      </Link>
                      <Badge tone={item.qty_available === 0 ? 'danger' : 'warning'}>
                        {item.qty_available === 0 ? 'Out of stock' : `${item.qty_available} left`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Everything is above its reorder level.</p>
              )}
            </Card>

            {expiring.length > 0 && (
              <Card>
                <SectionHeading title="Expiring soon" subtitle="Batches within 60 days of expiry" />
                <ul className="space-y-1.5">
                  {expiring.slice(0, 5).map((batch) => (
                    <li key={batch.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-ink">{batch.product_name}</span>
                      <Badge tone={batch.days_left < 30 ? 'danger' : 'warning'}>
                        {batch.days_left} days
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeading title="Best sellers" />
            {top.length ? (
              <ul className="space-y-2">
                {top.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink">{row.name}</span>
                    <span className="shrink-0 text-muted">
                      {row.units} units · {formatMoney(row.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No completed sales yet.</p>
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Unmet demand nearby"
              subtitle="Searches by buyers around you that returned nothing in stock"
            />
            {demand.length ? (
              <ul className="space-y-1.5">
                {demand.map((row) => (
                  <li key={row.query} className="flex items-center justify-between gap-3 text-sm">
                    <span className="capitalize text-ink">{row.query}</span>
                    <Badge tone="sand">{row.hits} searches</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Every nearby search is currently being met by stock in the network.
              </p>
            )}
          </Card>
        </div>
      </div>
    </PartnerShell>
  )
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium ${tone === 'warn' ? 'text-warning-ink' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}
