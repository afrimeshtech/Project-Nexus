import { AdminShell } from '@/components/shell/AdminShell'
import { Alert, Badge, Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { runMaintenanceAction } from '@/app/actions/admin'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { systemHealth } from '@/modules/platform/service'
import { verifyIntegrity } from '@/modules/wallet/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'System health' }

/**
 * Operational visibility (SAD, Monitoring & Observability). The checks below
 * are the ones the architecture document names: API/database latency, search
 * response times, payment success, inventory synchronisation and audit trails.
 */
export default async function HealthPage() {
  const admin = await requireRole(ADMIN_ROLES, '/admin/health')
  const readOnly = admin.role === 'auditor'

  const [health, integrity] = await Promise.all([systemHealth(), verifyIntegrity()])

  const checks = [
    {
      label: 'Database reachable',
      ok: health.dbLatencyMs < 500,
      value: `${health.dbLatencyMs} ms`,
      target: 'under 500 ms',
    },
    {
      label: 'Search within budget',
      ok: health.slowSearchShare < 1,
      value: `${health.slowSearchShare}% over 2 s`,
      target: 'PRD: results under 2 seconds',
    },
    {
      label: 'Ledger balanced',
      ok: integrity.balanced && integrity.netWalletPosition === 0,
      value: integrity.balanced ? 'All transactions balance' : 'Imbalance detected',
      target: 'debits = credits, net position zero',
    },
    {
      label: 'Notification queue drained',
      ok: health.queuedNotifications === 0,
      value: `${health.queuedNotifications} pending`,
      target: 'zero undelivered',
    },
    {
      label: 'No stranded reservations',
      ok: health.expiredReservations === 0,
      value: `${health.expiredReservations} expired`,
      target: 'released automatically on sweep',
    },
    {
      label: 'Risk queue clear',
      ok: health.openAlerts === 0,
      value: `${health.openAlerts} open alerts`,
      target: 'reviewed and resolved',
    },
  ]

  const failing = checks.filter((c) => !c.ok)

  return (
    <AdminShell active="/admin/health">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Health' }]}
          title="System health"
          subtitle="Live checks against the non-functional requirements"
          actions={
            readOnly ? null : (
              <form action={runMaintenanceAction}>
                <button
                  type="submit"
                  className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600"
                >
                  Run maintenance
                </button>
              </form>
            )
          }
        />

        {failing.length === 0 ? (
          <Alert tone="success">All {checks.length} checks are passing.</Alert>
        ) : (
          <Alert tone="warning">
            {failing.length} of {checks.length} checks need attention:{' '}
            {failing.map((c) => c.label).join(', ')}.
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Database" value={health.driver.split('(')[0].trim()} hint={health.driver} />
          <Stat label="Tables" value={health.tables} />
          <Stat label="Events (last hour)" value={health.eventsLastHour} />
          <Stat
            label="Held reservations"
            value={health.heldReservations}
            hint="Stock on live orders"
          />
        </div>

        <Card className="p-0">
          {/* A real table at sm+; a stacked card per check below it, so
              staff checking system health on a phone read the same data
              without scrolling sideways. */}
          <div className="hidden scroll-x sm:block">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">System health checks</caption>
              <thead>
                <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Check</th>
                  <th className="px-3 py-3 font-medium">Reading</th>
                  <th className="px-3 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.label} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{check.label}</td>
                    <td className="px-3 py-3 text-muted">{check.value}</td>
                    <td className="px-3 py-3 text-xs text-muted">{check.target}</td>
                    <td className="px-4 py-3 text-right">
                      {check.ok ? (
                        <Badge tone="brand">Pass</Badge>
                      ) : (
                        <Badge tone="danger">Attention</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 p-4 sm:hidden">
            {checks.map((check) => (
              <li key={check.label} className="rounded-brand border border-line-soft p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-ink">{check.label}</p>
                  {check.ok ? (
                    <Badge tone="brand">Pass</Badge>
                  ) : (
                    <Badge tone="danger">Attention</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{check.value}</p>
                <p className="mt-0.5 text-xs text-muted">Target: {check.target}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionHeading title="What maintenance does" />
          <ul className="space-y-1.5 text-sm text-muted">
            <li>
              · Releases stock reservations whose payment window expired, and cancels those orders
            </li>
            <li>· Retries queued and failed notifications across every channel</li>
            <li>· Re-runs the fraud rule sweep over recent transactions</li>
          </ul>
          <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
            In production these run on a schedule. Exposing them here means an operator can force a
            pass during an incident without a deployment.
          </p>
        </Card>
      </div>
    </AdminShell>
  )
}
