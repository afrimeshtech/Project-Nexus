import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { BarSeries } from '@/components/charts/BarSeries'
import { ActivityPanel } from '@/components/territory/ActivityPanel'
import { Alert, Badge, Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { formatMoney, formatMoneyCompact } from '@/lib/money'
import { gmvSeries, platformKpis } from '@/modules/analytics/service'
import { verifyIntegrity } from '@/modules/wallet/service'
import { listAlerts } from '@/modules/platform/service'
import { trendingSearches } from '@/modules/search/service'
import { logisticsOverview } from '@/modules/logistics/service'
import { heldForMerchants, reconcile, revenueOverview } from '@/modules/revenue/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Platform console' }

/**
 * Platform overview. Every figure is the PRD's or BRS's own success metric,
 * computed from transactional data rather than maintained by hand.
 */
export default async function AdminHome() {
  await requireRole(ADMIN_ROLES, '/admin')

  const [kpis, series, integrity, alerts, trending, logistics, revenue, recon, held] =
    await Promise.all([
      platformKpis(),
      gmvSeries(14),
      verifyIntegrity(),
      listAlerts(),
      trendingSearches(8),
      logisticsOverview(),
      revenueOverview(),
      reconcile(),
      heldForMerchants(),
    ])

  return (
    <AdminShell active="/admin">
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Admin' }]}
          title="Platform overview"
          subtitle="Live commerce, payment and inventory health across the network"
        />

        {!integrity.balanced && (
          <Alert tone="danger">
            Ledger integrity failure: {integrity.unbalancedTransactions.length} transaction(s) do
            not balance. Investigate before processing further settlements.
          </Alert>
        )}
        {kpis.pending_verifications > 0 && (
          <Alert tone="warning">
            {kpis.pending_verifications} business
            {kpis.pending_verifications === 1 ? '' : 'es'} awaiting verification.{' '}
            <Link
              href="/admin/organisations?verification=pending"
              className="font-semibold underline"
            >
              Review the queue
            </Link>
          </Alert>
        )}

        {/* Three scoreboards, never added together: what trades through the
            network, what AfriMesh earns from it, and whether that pays for
            itself. GMV is not revenue - most of it belongs to sellers. */}
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Commerce performance
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="GMV"
              value={formatMoney(kpis.gmv)}
              hint={
                revenue.hasLivePayments
                  ? 'Paid orders, all tiers, net of refunds'
                  : 'Paid orders, net of refunds · test-mode payments'
              }
              href="#gmv"
            />
            {/* Same basis as GMV, so GMV / paid orders = AOV on screen. */}
            <Stat
              label="Paid orders"
              value={kpis.paid_orders}
              hint={`${kpis.unpaid_orders} placed but not paid`}
              href="/admin/events?type=order.placed"
            />
            <Stat
              label="Average order value"
              value={formatMoney(kpis.aov)}
              hint="GMV ÷ paid orders"
            />
            <Stat
              label="Fulfilment rate"
              href="/admin/events?type=order.completed"
              value={`${Number(kpis.fulfilment_rate).toFixed(1)}%`}
              tone={Number(kpis.fulfilment_rate) < 90 ? 'danger' : 'brand'}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Platform monetisation
          </h2>
          {/* Real money only. Test activity is shown as a hint, never as the
              figure, so a demo cannot be read as earnings. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Revenue earned"
              value={formatMoney(revenue.live.revenue_earned)}
              hint={
                revenue.hasLivePayments
                  ? `${revenue.live.completed_orders} completed orders`
                  : `Test mode · ${formatMoney(revenue.test.revenue_earned)} simulated`
              }
              href="/admin/revenue"
              tone={revenue.hasLivePayments ? 'brand' : 'neutral'}
            />
            <Stat
              label="Commission pending"
              value={formatMoney(revenue.live.commission_pending)}
              hint={
                revenue.hasLivePayments
                  ? 'Paid orders not yet completed'
                  : `${formatMoney(revenue.test.commission_pending)} simulated`
              }
              href="/admin/revenue"
              icon="clock"
            />
            <Stat
              label="Commission reversed"
              value={formatMoney(revenue.live.commission_reversed)}
              hint={
                revenue.hasLivePayments
                  ? 'Handed back on refunds'
                  : `${formatMoney(revenue.test.commission_reversed)} simulated`
              }
              href="/admin/revenue"
              icon="refresh"
            />
            <Stat
              label="Subscription revenue"
              value="—"
              hint="Not offered yet"
              href="/admin/revenue"
              icon="star"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Financial health
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Held for merchants"
              value={formatMoney(held.escrow + held.available)}
              hint="Their money - not income"
              href="/admin/revenue"
              icon="wallet"
            />
            <Stat
              label="Rewards paid from revenue"
              value={formatMoney(recon.rewardsPaid)}
              hint="Cashback and redeemed points"
              href="/admin/revenue"
              icon="star"
            />
            <Stat
              label="Net operating result"
              value="—"
              hint="Expenses and gateway fees not tracked yet"
              href="/admin/revenue"
            />
            <Stat
              label="Revenue ledger"
              value={recon.difference === 0 ? 'Agrees' : formatMoney(recon.difference)}
              hint={recon.difference === 0 ? 'Orders match the ledger' : 'Unexplained difference'}
              tone={recon.difference === 0 ? 'brand' : 'danger'}
              href="/admin/revenue"
              icon="list"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Network</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Monthly active users" value={kpis.mau} hint={`${kpis.dau} today`} />
            <Stat label="Consumers" value={kpis.consumers} href="/admin/locations#tier-consumer" />
            <Stat
              label="Retail outlets"
              value={kpis.active_outlets}
              href="/admin/organisations?type=outlet"
            />
            <Stat
              label="Merchants"
              value={kpis.active_merchants}
              href="/admin/organisations?type=merchant"
            />
            <Stat
              label="Warehouses"
              value={kpis.active_warehouses}
              href="/admin/organisations?type=warehouse"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Logistics</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat
              label="Open delivery jobs"
              href="/admin/events?type=delivery.requested"
              value={logistics.open_jobs}
              tone={logistics.open_jobs > 20 ? 'danger' : 'neutral'}
              hint="Unclaimed by any rider"
            />
            <Stat
              label="In progress"
              value={logistics.in_progress}
              href="/admin/events?type=delivery.accepted"
            />
            <Stat
              label="Deliveries completed"
              value={logistics.completed}
              href="/admin/events?type=delivery.completed"
            />
            <Stat
              label="Delivery partners"
              value={logistics.riders}
              href="/admin/locations#tier-rider"
            />
            <Stat
              label="Average trip"
              value={`${Number(logistics.avg_distance).toFixed(1)} km`}
              href="/admin/locations#tier-rider"
            />
          </div>
        </section>

        {/* Every other dashboard leads with the demand it can act on; the
            console should too, rather than making an operations lead open a
            second page to find out where the network actually is. */}
        <ActivityPanel
          audience="consumer"
          title="Where the network is busiest"
          subtitle="Retail demand over the last 90 days — the base of the whole chain. Every tier's map is on the demand map."
          origin={null}
          originLabel="Network centre"
          days={90}
          limit={5}
          minActors={1}
          moreHref="/admin/locations"
        />

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_20rem]">
          {/* The GMV tile's link lands here. */}
          <div id="gmv" className="scroll-mt-4">
            <Card>
              <SectionHeading
                title="GMV, last 14 days"
                subtitle={`Total ${formatMoneyCompact(kpis.gmv)} settled through the platform`}
              />
              <BarSeries
                data={series}
                valueKey="gmv"
                caption="Daily gross merchandise value"
                emptyLabel="No paid orders in the last 14 days"
              />
            </Card>
          </div>

          <Card>
            <SectionHeading title="Service levels" subtitle="Against PRD non-functional targets" />
            <dl className="space-y-2 text-sm">
              <Row
                label="Payment success rate"
                value={`${Number(kpis.payment_success_rate).toFixed(1)}%`}
                ok={Number(kpis.payment_success_rate) >= 95}
              />
              <Row
                label="Search success rate"
                value={`${Number(kpis.search_success_rate).toFixed(1)}%`}
                ok={Number(kpis.search_success_rate) >= 70}
              />
              <Row
                label="Average search time"
                value={`${kpis.avg_search_ms} ms`}
                ok={kpis.avg_search_ms < 2000}
              />
              <Row
                label="Stock-out rate"
                value={`${Number(kpis.stock_out_rate).toFixed(1)}%`}
                ok={Number(kpis.stock_out_rate) < 10}
              />
              <Row label="Listed products" value={kpis.listed_skus.toLocaleString()} ok />
              <Row label="Units available" value={kpis.units_available.toLocaleString()} ok />
            </dl>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeading
              title="Financial integrity"
              subtitle="Recomputed from the double-entry ledger on every load"
            />
            <dl className="space-y-2 text-sm">
              <Row
                label="All transactions balance"
                value={integrity.balanced ? 'Yes' : 'No'}
                ok={integrity.balanced}
              />
              <Row label="Total debits" value={formatMoney(integrity.totalDebits)} ok />
              <Row label="Total credits" value={formatMoney(integrity.totalCredits)} ok />
              {integrity.positionsByCurrency.map((position) => (
                <Row
                  key={position.currency}
                  label={`Net position (${position.currency})`}
                  value={Number(position.net).toLocaleString('en-NG')}
                  ok={Number(position.net) === 0}
                />
              ))}
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
              Every net position must be exactly zero, in each currency: member balances are offset
              by the platform float, and reward points by the points float. Any other figure means
              value was created or destroyed.
            </p>
          </Card>

          <div className="space-y-4">
            <Card>
              <SectionHeading
                title="Open risk alerts"
                action={
                  <Link
                    href="/admin/fraud"
                    className="text-sm font-medium text-accent-strong hover:underline"
                  >
                    Review
                  </Link>
                }
              />
              {alerts.length ? (
                <ul className="space-y-1.5 text-sm">
                  {alerts.slice(0, 5).map((alert) => (
                    <li key={alert.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink">{alert.detail}</span>
                      <Badge
                        tone={
                          alert.severity === 'high'
                            ? 'danger'
                            : alert.severity === 'medium'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {alert.kind.replace(/_/g, ' ')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No open alerts.</p>
              )}
            </Card>

            <Card>
              <SectionHeading title="What buyers are searching for" />
              <div className="flex flex-wrap gap-1.5">
                {trending.map((t) => (
                  <Badge key={t.query} tone="neutral">
                    {t.query} · {t.hits}
                  </Badge>
                ))}
                {!trending.length && <p className="text-sm text-muted">No searches yet.</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium ${ok === false ? 'text-coral-ink' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
