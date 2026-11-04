import Link from 'next/link'
import type { ReactNode } from 'react'
import { AdminShell } from '@/components/shell/AdminShell'
import { BarSeries } from '@/components/charts/BarSeries'
import { Alert, Badge, Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import {
  heldForMerchants,
  reconcile,
  revenueByCategory,
  revenueByPeriod,
  revenueByTier,
  revenueOverview,
  revenueSeries,
  type MoneyMode,
} from '@/modules/revenue/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Revenue' }

/**
 * What AfriMesh earns, as distinct from what trades through it. GMV lives on
 * the overview; this page is the platform's own income, its costs, and the
 * money it holds that is not its own. See modules/revenue for definitions.
 *
 * Real money and test money are never added together. Until a real payment
 * gateway has taken a payment, every figure is simulated and the page says so
 * before it says anything else.
 */
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ money?: string }>
}) {
  await requireRole(ADMIN_ROLES, '/admin/revenue')
  const params = await searchParams

  const overview = await revenueOverview()
  // Default to real money once any exists; until then the only activity there
  // is to show is test activity, and the banner says what that means.
  const mode: MoneyMode =
    params.money === 'live' || params.money === 'test'
      ? params.money
      : overview.hasLivePayments
        ? 'live'
        : 'test'
  const s = overview[mode]

  const [daily, weekly, monthly, byTier, byCategory, recon, held] = await Promise.all([
    revenueSeries(mode, 30),
    revenueByPeriod(mode, 'week', 8),
    revenueByPeriod(mode, 'month', 6),
    revenueByTier(mode),
    revenueByCategory(mode),
    reconcile(),
    heldForMerchants(),
  ])

  const feeBps = Number(process.env.PLATFORM_FEE_BPS ?? 150)
  const perOrder = s.completed_orders ? Math.round(s.revenue_earned / s.completed_orders) : 0
  const perMerchant = s.earning_merchants ? Math.round(s.revenue_earned / s.earning_merchants) : 0
  const takeRate = s.gmv ? ((s.revenue_earned + s.commission_pending) / s.gmv) * 100 : 0
  const simulated = mode === 'test'

  return (
    <AdminShell active="/admin/revenue">
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Revenue' }]}
          title="Revenue & monetisation"
          subtitle="What AfriMesh earns, kept apart from GMV - the value of goods that trade through the network, which belongs almost entirely to sellers"
        />

        {!overview.hasLivePayments && (
          <Alert tone="warning">
            Payments are in test mode (gateway: {overview.activeGateway}). No real money has moved
            through AfriMesh yet, so revenue earned is {formatMoney(0)}. The test-mode figures below
            show what the platform would have earned on simulated activity. They are not cash and
            must not be presented as earnings.
          </Alert>
        )}
        {overview.hasLivePayments && simulated && (
          <Alert tone="info">
            Showing test-mode activity only. These figures are simulated and are not earnings.
          </Alert>
        )}

        <nav aria-label="Money shown" className="flex flex-wrap gap-2">
          <ModeTab href="/admin/revenue?money=live" current={mode === 'live'}>
            Real money
          </ModeTab>
          <ModeTab href="/admin/revenue?money=test" current={mode === 'test'}>
            Test mode
          </ModeTab>
        </nav>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Platform monetisation{simulated ? ' · simulated' : ''}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Revenue earned"
              value={formatMoney(s.revenue_earned)}
              hint={`${s.completed_orders} completed order${s.completed_orders === 1 ? '' : 's'}`}
              tone={simulated ? 'neutral' : 'brand'}
            />
            <Stat
              label="Commission pending"
              value={formatMoney(s.commission_pending)}
              hint="Paid orders not yet completed"
              icon="clock"
            />
            <Stat
              label="Commission reversed"
              value={formatMoney(s.commission_reversed)}
              hint="Handed back on refunds"
              icon="refresh"
            />
            <Stat
              label="Revenue per completed order"
              value={formatMoney(perOrder)}
              hint={`${formatMoney(perMerchant)} per earning merchant`}
            />
          </div>
        </section>

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_22rem]">
          <Card>
            <SectionHeading
              title="Revenue earned, last 30 days"
              subtitle="Commission when an order completes, delivery margin when a rider delivers"
            />
            <BarSeries
              data={daily}
              valueKey="revenue"
              caption="Daily revenue earned"
              emptyLabel="No revenue earned in the last 30 days"
            />
          </Card>

          <Card>
            <SectionHeading title="Revenue by source" />
            <dl className="space-y-2 text-sm">
              <Row label={`Commission (${(feeBps / 100).toFixed(2)}% of subtotal)`}>
                {formatMoney(s.commission_earned)}
              </Row>
              <Row label="Delivery margin">{formatMoney(s.delivery_margin)}</Row>
              <Row label="Merchant subscriptions">
                <NotYet>Not offered</NotYet>
              </Row>
              <Row label="Payment services">
                <NotYet>Not offered</NotYet>
              </Row>
              <Row label="Data & API services">
                <NotYet>Not offered</NotYet>
              </Row>
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
              GMV {formatMoney(s.gmv)} across {s.paid_orders} paid order
              {s.paid_orders === 1 ? '' : 's'}; the platform keeps {takeRate.toFixed(2)}% of it,
              counting commission still pending. GMV is never counted as revenue.
            </p>
          </Card>
        </div>

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
          <Card>
            <SectionHeading title="By week" subtitle="Last 8 weeks, most recent first" />
            <MoneyTable
              head={['Week', 'Completed orders', 'Revenue']}
              rows={weekly.map((w) => [w.period, w.completed_orders, formatMoney(w.revenue)])}
            />
          </Card>
          <Card>
            <SectionHeading title="By month" subtitle="Last 6 months, most recent first" />
            <MoneyTable
              head={['Month', 'Completed orders', 'Revenue']}
              rows={monthly.map((m) => [m.period, m.completed_orders, formatMoney(m.revenue)])}
            />
          </Card>
        </div>

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
          <Card>
            <SectionHeading title="Commission by seller tier" subtitle="Earned, completed orders" />
            <MoneyTable
              head={['Tier', 'Orders', 'Commission']}
              rows={byTier.map((t) => [t.label, t.orders, formatMoney(t.commission)])}
              empty="No completed orders yet"
            />
          </Card>
          <Card>
            <SectionHeading
              title="Commission by category"
              subtitle="Each line's share of its order's fee"
            />
            <MoneyTable
              head={['Category', 'Units', 'Commission']}
              rows={byCategory.map((c) => [c.category, c.units, formatMoney(c.commission)])}
              empty="No completed orders yet"
            />
          </Card>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Financial health
          </h2>
          <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
            <Card>
              <SectionHeading title="Result" subtitle="Revenue less the costs of earning it" />
              <dl className="space-y-2 text-sm">
                <Row label="Revenue earned">{formatMoney(s.revenue_earned)}</Row>
                <Row label="Rewards paid from revenue">
                  {formatMoney(recon.rewardsPaid)}
                </Row>
                <Row label="Payment-provider fees">
                  <NotYet>Not recorded</NotYet>
                </Row>
                <Row label="Operating expenses">
                  <NotYet>Not tracked</NotYet>
                </Row>
                <Row label="Net operating result">—</Row>
              </dl>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                Rewards are cashback and redeemed points, across all activity. Gateway fees are
                not recorded while payments run in test mode, and operating costs live outside
                the platform, so no net result is claimed until both exist.
              </p>
            </Card>

            <Card>
              <SectionHeading title="Held for merchants" subtitle="Their money, not income" />
              <dl className="space-y-2 text-sm">
                <Row label="In escrow (orders not completed)">{formatMoney(held.escrow)}</Row>
                <Row label="Available to withdraw">{formatMoney(held.available)}</Row>
                <Row label="Total owed to businesses">
                  {formatMoney(held.escrow + held.available)}
                </Row>
              </dl>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                Across {held.businesses} business{held.businesses === 1 ? '' : 'es'}. Cash the
                platform holds includes this, which is why cash collected is not revenue.
              </p>
            </Card>

            <Card>
              <SectionHeading title="Ledger reconciliation" subtitle="All activity, recomputed" />
              <dl className="space-y-2 text-sm">
                <Row label="Revenue wallet (ledger)">{formatMoney(recon.ledgerBalance)}</Row>
                <Row label="Expected from orders">{formatMoney(recon.expected)}</Row>
                <Row label="Difference">
                  {recon.difference === 0 ? (
                    <Badge tone="success">Agrees</Badge>
                  ) : (
                    <Badge tone="danger">{formatMoney(recon.difference)}</Badge>
                  )}
                </Row>
              </dl>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                Expected = commission on paid orders + delivery margin - rewards paid. Any
                difference is money the reports cannot account for; investigate it before quoting
                these figures.
              </p>
            </Card>
          </div>
        </section>
      </div>
    </AdminShell>
  )
}

function ModeTab({
  href,
  current,
  children,
}: {
  href: string
  current: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      // The same chip as the order filters (partner/orders), so a choice of view
      // reads the same everywhere.
      className={`rounded-full px-3.5 py-2 text-xs font-medium ${
        current ? 'bg-surface-deep text-white' : 'border border-line bg-surface text-muted'
      }`}
    >
      {children}
    </Link>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-ink">{children}</dd>
    </div>
  )
}

/** A stream or cost the platform does not have yet - said, rather than shown as ₦0.00. */
function NotYet({ children }: { children: ReactNode }) {
  return <span className="font-normal text-muted">{children}</span>
}

function MoneyTable({
  head,
  rows,
  empty = 'Nothing in this period',
}: {
  head: [string, string, string]
  rows: (string | number)[][]
  empty?: string
}) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
          <th className="py-2 pr-3 font-medium">{head[0]}</th>
          <th className="py-2 pr-3 text-right font-medium">{head[1]}</th>
          <th className="py-2 text-right font-medium">{head[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line-soft last:border-0">
            <td className="py-2 pr-3 text-ink">{r[0]}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-muted">{r[1]}</td>
            <td className="py-2 text-right font-medium tabular-nums text-ink">{r[2]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
