import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { BarSeries } from '@/components/charts/BarSeries'
import { ActivityPanel } from '@/components/territory/ActivityPanel'
import { Alert, Badge, Card, SectionHeading, Stat } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { formatMoney, formatMoneyCompact } from '@/lib/money'
import { gmvSeries, platformKpis } from '@/modules/analytics/service'
import { verifyIntegrity } from '@/modules/wallet/service'
import { listAlerts } from '@/modules/platform/service'
import { trendingSearches } from '@/modules/search/service'
import { logisticsOverview } from '@/modules/logistics/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Platform console' }

/**
 * Platform overview. Every figure is the PRD's or BRS's own success metric,
 * computed from transactional data rather than maintained by hand.
 */
export default async function AdminHome() {
  await requireRole(ADMIN_ROLES, '/admin')

  const [kpis, series, integrity, alerts, trending, logistics] = await Promise.all([
    platformKpis(),
    gmvSeries(14),
    verifyIntegrity(),
    listAlerts(),
    trendingSearches(8),
    logisticsOverview(),
  ])

  return (
    <AdminShell active="/admin">
      <div className="space-y-8">
        <SectionHeading
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

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Commerce</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="GMV" value={formatMoney(kpis.gmv)} hint="Paid orders, all tiers" />
            <Stat label="Average order value" value={formatMoney(kpis.aov)} />
            <Stat
              label="Orders (30 days)"
              value={kpis.orders_30d}
              hint={`${kpis.orders_total} all time`}
            />
            <Stat
              label="Fulfilment rate"
              value={`${Number(kpis.fulfilment_rate).toFixed(1)}%`}
              tone={Number(kpis.fulfilment_rate) < 90 ? 'danger' : 'brand'}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Network</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Monthly active users" value={kpis.mau} hint={`${kpis.dau} today`} />
            <Stat label="Consumers" value={kpis.consumers} />
            <Stat label="Retail outlets" value={kpis.active_outlets} />
            <Stat label="Merchants" value={kpis.active_merchants} />
            <Stat label="Warehouses" value={kpis.active_warehouses} />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Logistics</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat
              label="Open delivery jobs"
              value={logistics.open_jobs}
              tone={logistics.open_jobs > 20 ? 'danger' : 'neutral'}
              hint="Unclaimed by any rider"
            />
            <Stat label="In progress" value={logistics.in_progress} />
            <Stat label="Deliveries completed" value={logistics.completed} />
            <Stat label="Delivery partners" value={logistics.riders} />
            <Stat label="Average trip" value={`${Number(logistics.avg_distance).toFixed(1)} km`} />
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

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
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
                    className="text-sm font-medium text-accent-500 hover:underline"
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
