import { AdminShell } from '@/components/shell/AdminShell'
import { ReferralPointsForm } from '@/components/admin/AdminForms'
import { Alert, Badge, Card, EmptyState, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { currencySymbol, formatMoney } from '@/lib/money'
import {
  MIN_REDEEMABLE_POINTS,
  POINT_VALUE_MINOR,
  PROGRAMME_LABEL,
  REFERRAL_MIN_ORDER_MINOR,
  formatPoints,
} from '@/lib/points'
import { programmeStats, referralPoints, topReferrers } from '@/modules/rewards/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Referral programme' }

/**
 * Programme oversight.
 *
 * The figure that matters here is the outstanding liability: points issued and
 * not yet converted are money the platform owes and has not yet paid. It is
 * computed from the ledger on every load rather than tracked by hand, for the
 * same reason the wallet integrity check is.
 */
export default async function AdminRewardsPage() {
  const admin = await requireRole(ADMIN_ROLES, '/admin/rewards')
  const readOnly = admin.role === 'auditor'

  const [stats, awards, leaders] = await Promise.all([
    programmeStats(),
    referralPoints(),
    topReferrers(10),
  ])

  const conversionRate = stats.points_issued
    ? Math.round((stats.points_redeemed / stats.points_issued) * 100)
    : 0

  return (
    <AdminShell active="/admin/rewards">
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Rewards' }]}
          title="Referral programme"
          subtitle="Members invite their own tier: shoppers bring shoppers, outlets bring outlets, merchants bring merchants. Rewards are paid in points against a ledger liability, and cost the platform cash only on conversion."
        />

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Liability</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Points outstanding"
              value={formatPoints(stats.points_outstanding)}
              hint="Issued and not yet converted"
              icon="star-filled"
            />
            <Stat
              label="Cash liability"
              value={formatMoney(stats.liability_minor)}
              hint={`At ${formatMoney(POINT_VALUE_MINOR)} per point`}
              tone={stats.liability_minor > 0 ? 'brand' : 'neutral'}
            />
            <Stat
              label="Points issued"
              value={formatPoints(stats.points_issued)}
              hint={`${formatPoints(stats.points_redeemed)} converted (${conversionRate}%)`}
            />
            <Stat label="Members holding points" value={stats.members_with_points} icon="user" />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Referrals</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Invitations accepted" value={stats.referrals_total} icon="user" />
            <Stat
              label="Awaiting first order"
              value={stats.referrals_pending}
              hint="Costs nothing until they trade"
              icon="clock"
            />
            <Stat label="Rewarded" value={stats.referrals_rewarded} icon="check" />
            <Stat
              label="Qualifying order floor"
              value={formatMoney(REFERRAL_MIN_ORDER_MINOR)}
              hint="Below this, a referral stays pending"
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeading
              title="Award per qualified referral"
              subtitle="Applies to every referral settled from the moment you save — referrals already paid are untouched"
            />
            {readOnly ? (
              <dl className="space-y-2 text-sm">
                {Object.entries(awards).map(([programme, value]) => (
                  <div key={programme} className="flex items-center justify-between gap-3">
                    <dt className="text-muted">
                      {PROGRAMME_LABEL[programme as keyof typeof PROGRAMME_LABEL] ?? programme}
                    </dt>
                    <dd className="font-medium text-ink">{formatPoints(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ReferralPointsForm
                points={awards}
                labels={PROGRAMME_LABEL}
                pointValueMinor={POINT_VALUE_MINOR}
                currencySymbol={currencySymbol()}
              />
            )}
            <p className="mt-4 border-t border-line-soft pt-3 text-xs text-muted">
              Points are convertible from {MIN_REDEEMABLE_POINTS.toLocaleString('en-NG')} upwards
              and are funded from platform revenue on conversion, exactly as cashback is. A referral
              that never converts costs nothing but the liability line above.
            </p>
          </Card>

          <div className="space-y-4">
            {stats.referrals_pending > 0 && (
              <Alert tone="info">
                {stats.referrals_pending} accepted invitation
                {stats.referrals_pending === 1 ? '' : 's'} have not yet produced a qualifying order.
                They are the programme&rsquo;s live pipeline, and they carry no cost.
              </Alert>
            )}

            <Card>
              <SectionHeading
                title="Top referrers"
                subtitle="Members growing the network fastest"
              />
              {leaders.length ? (
                <ul className="space-y-2 text-sm">
                  {leaders.map((leader) => (
                    <li
                      key={leader.user_id}
                      className="flex items-center justify-between gap-3 border-b border-line-soft pb-2 last:border-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-ink">
                          {leader.organisation_name ?? leader.full_name}
                        </span>
                        <span className="block text-xs capitalize text-muted">
                          {leader.role.replace(/_/g, ' ')}
                          {leader.organisation_name ? ` · ${leader.full_name}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone="neutral">{leader.rewarded} referred</Badge>
                        <span className="font-medium text-ink">
                          {formatPoints(leader.points_earned)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="user"
                  title="No referrals have paid out yet"
                  body="A referral settles the first time the person invited completes a qualifying order."
                />
              )}
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
