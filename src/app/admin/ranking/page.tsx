import { AdminShell } from '@/components/shell/AdminShell'
import { RankingWeightsForm } from '@/components/admin/AdminForms'
import { Card, PageHeader, SectionHeading } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { DEFAULT_WEIGHTS, getWeights, type RankingScope } from '@/modules/recommendation/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ranking engine' }

const SCOPES: { key: RankingScope; title: string; subtitle: string }[] = [
  {
    key: 'consumer',
    title: 'Consumer ranking',
    subtitle: 'How retail outlets are ordered for a shopper',
  },
  {
    key: 'outlet',
    title: 'Outlet ranking',
    subtitle: 'How merchants are ordered for a retail outlet restocking',
  },
  {
    key: 'merchant',
    title: 'Merchant ranking',
    subtitle: 'How dealer warehouses are ordered for a merchant restocking',
  },
]

/**
 * "Weights should be configurable without changing application code."
 * — System Architecture Document, Recommendation Engine.
 *
 * This page is that requirement made operable: an operations lead can retune
 * the entire marketplace here, with no deployment.
 */
export default async function RankingPage() {
  const admin = await requireRole(ADMIN_ROLES, '/admin/ranking')
  const readOnly = admin.role === 'auditor'

  const weights = await Promise.all(SCOPES.map((scope) => getWeights(scope.key)))

  return (
    <AdminShell active="/admin/ranking">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Ranking' }]}
          title="Recommendation engine"
          subtitle="The weighted model that decides which seller a buyer sees first. Changes take effect on the next search — no deployment required."
        />

        <Card>
          <h2 className="font-semibold text-ink">How scoring works</h2>
          <p className="mt-1.5 text-sm text-muted">
            Each factor is normalised to a 0&ndash;1 value, multiplied by its weight, and the sum is
            divided by the total weight to give a score out of 100. Only the <em>relative</em> size
            of the weights matters, so you can use any scale you like. Ranking runs inside
            PostgreSQL rather than in the application, which keeps results inside the PRD&rsquo;s
            two-second search budget even on a large candidate set.
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {SCOPES.map((scope, index) => (
            <Card key={scope.key}>
              <SectionHeading title={scope.title} subtitle={scope.subtitle} />
              {readOnly ? (
                <dl className="space-y-2 text-sm">
                  {Object.entries(weights[index]).map(([factor, weight]) => (
                    <div key={factor} className="flex items-center justify-between gap-3">
                      <dt className="capitalize text-muted">{factor.replace(/_/g, ' ')}</dt>
                      <dd className="font-medium text-ink">{weight}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <RankingWeightsForm scope={scope.key} weights={weights[index]} />
              )}
            </Card>
          ))}
        </div>

        <Card>
          <SectionHeading
            title="Reference: shipped defaults"
            subtitle="The values in the System Architecture Document, for comparison"
          />
          <div className="scroll-x">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">Default ranking weights by scope</caption>
              <thead>
                <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Factor</th>
                  {SCOPES.map((s) => (
                    <th key={s.key} className="py-2 pr-3 text-right font-medium capitalize">
                      {s.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Set(SCOPES.flatMap((s) => Object.keys(DEFAULT_WEIGHTS[s.key])))].map(
                  (factor) => (
                    <tr key={factor} className="border-b border-line-soft last:border-0">
                      <td className="py-2 pr-3 capitalize text-ink">{factor.replace(/_/g, ' ')}</td>
                      {SCOPES.map((s) => (
                        <td key={s.key} className="py-2 pr-3 text-right text-muted">
                          {DEFAULT_WEIGHTS[s.key][factor] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}
