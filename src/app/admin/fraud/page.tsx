import { AdminShell } from '@/components/shell/AdminShell'
import { Badge, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui'
import { resolveAlertAction, runSweepAction } from '@/app/actions/admin'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { listAlerts } from '@/modules/platform/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Risk & fraud' }

const RULES = [
  {
    kind: 'velocity',
    label: 'Velocity check',
    detail: 'Six or more orders from one account within an hour',
  },
  {
    kind: 'failed_payments',
    label: 'Card testing',
    detail: 'Three or more declined payments within an hour',
  },
  {
    kind: 'geo_anomaly',
    label: 'Geo anomaly',
    detail: 'Delivery point beyond three times the seller’s radius',
  },
  {
    kind: 'high_value',
    label: 'High value',
    detail: 'Unusually large order relative to account history',
  },
  {
    kind: 'oversell',
    label: 'Oversell attempt',
    detail: 'Reservation rejected for insufficient stock',
  },
]

/**
 * Rule-based fraud monitoring: risk scoring, transaction monitoring,
 * geo-anomaly detection and velocity checks (SAD, Fraud Prevention). The
 * machine-learned model is a Phase 3 item and will consume the same event log.
 */
export default async function FraudPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>
}) {
  const params = await searchParams
  const admin = await requireRole(ADMIN_ROLES, '/admin/fraud')
  const readOnly = admin.role === 'auditor'
  const alerts = await listAlerts(params.all === '1')

  return (
    <AdminShell active="/admin/fraud">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Fraud' }]}
          title="Risk & fraud monitoring"
          subtitle="Rule-based signals over live transaction data"
          actions={
            readOnly ? null : (
              <form action={runSweepAction}>
                <button
                  type="submit"
                  className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600"
                >
                  Run sweep now
                </button>
              </form>
            )
          }
        />

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-2">
            {alerts.length ? (
              alerts.map((alert) => (
                <Card key={alert.id} className="flex flex-wrap items-center gap-3">
                  <Badge
                    tone={
                      alert.severity === 'high'
                        ? 'danger'
                        : alert.severity === 'medium'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {alert.severity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize text-ink">
                      {alert.kind.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm text-muted">{alert.detail}</p>
                    <p className="font-technical text-xs text-muted">
                      {alert.user_name ?? 'system'}
                      {alert.order_number && ` · ${alert.order_number}`} ·{' '}
                      {new Date(alert.created_at).toLocaleString('en-NG')}
                    </p>
                  </div>
                  {alert.resolved ? (
                    <Badge tone="brand">Resolved</Badge>
                  ) : (
                    !readOnly && (
                      <form action={resolveAlertAction}>
                        <input type="hidden" name="alertId" value={alert.id} />
                        <button
                          type="submit"
                          className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
                        >
                          Mark resolved
                        </button>
                      </form>
                    )
                  )}
                </Card>
              ))
            ) : (
              <EmptyState
                icon="shield"
                title="No open alerts"
                body="Nothing has tripped a risk rule. Run a sweep to re-evaluate recent activity."
              />
            )}
          </div>

          <Card>
            <SectionHeading title="Active rules" />
            <ul className="space-y-3">
              {RULES.map((rule) => (
                <li key={rule.kind}>
                  <p className="text-sm font-medium text-ink">{rule.label}</p>
                  <p className="text-xs text-muted">{rule.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
              Every alert is also written to the immutable event log, so a model trained later has
              the full history to learn from.
            </p>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}
