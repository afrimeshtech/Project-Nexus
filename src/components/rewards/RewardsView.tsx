import { Statement } from '@/components/commerce/Statement'
import { InviteCard, RedeemPointsForm } from '@/components/rewards/RewardsForms'
import { Badge, Card, EmptyState, SectionHeading, Stat } from '@/components/ui'
import { formatMoney } from '@/lib/money'
import {
  MIN_REDEEMABLE_POINTS,
  POINT_VALUE_MINOR,
  PROGRAMME_LABEL,
  formatPoints,
  pointsToMinor,
  programmeForRole,
  type Programme,
} from '@/lib/points'
import { statement } from '@/modules/wallet/service'
import {
  pointsBalance,
  referralCodeFor,
  referralPoints,
  referralSummary,
  referralsFor,
  referredBy,
  rewardsBeneficiary,
} from '@/modules/rewards/service'

/**
 * The rewards screen, rendered identically on the shopper dashboard and on
 * every business dashboard.
 *
 * One screen rather than three, because the programme genuinely is one
 * mechanism: you invite someone at your own level, and you earn when they
 * trade. What differs by tier is who the points belong to and how much a
 * referral is worth — both of which are data, passed in here.
 */
export async function RewardsView({ userId, role }: { userId: string; role: string }) {
  const programme = programmeForRole(role)

  // Resolved from the same helper the reward payment uses, so what the screen
  // shows and what the ledger credits are the same wallet by construction.
  const beneficiary = await rewardsBeneficiary(userId)

  const [code, balance, summary, referrals, invitedBy, awards] = await Promise.all([
    referralCodeFor(userId),
    pointsBalance(beneficiary.type, beneficiary.id),
    referralSummary(userId),
    referralsFor(userId, 25),
    referredBy(userId),
    referralPoints(),
  ])

  const lines = await statement(balance.walletId, 25)
  const perReferral = awards[programme]
  const rateLabel = `1 point = ${formatMoney(POINT_VALUE_MINOR)}`

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Reward points"
          value={formatPoints(balance.available)}
          hint={`Held by ${beneficiary.label}`}
          icon="star-filled"
        />
        <Stat
          label="Cash value"
          value={formatMoney(balance.redeemableValue)}
          hint={rateLabel}
          tone="brand"
        />
        <Stat
          label="People you invited"
          value={summary.invited}
          hint={`${summary.pending} yet to order`}
          icon="user"
        />
        <Stat
          label="Referrals earned"
          value={summary.rewarded}
          hint={`${formatPoints(summary.points_earned)} all time`}
          icon="check"
        />
      </div>

      {/* Sharing the code is the entire job of this screen, so it leads.
          Previously it sat in the right-hand column, which stacks *below* the
          explainer, the referral table and the statement on anything narrower
          than a desktop — the one action people came for, three screens down. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title={inviteHeading(programme)}
            subtitle={`Your code never expires · earns ${formatPoints(perReferral)} per referral that buys`}
          />
          <InviteCard code={code} />
        </Card>

        <Card>
          <SectionHeading
            title="Convert points to cash"
            subtitle={`${rateLabel} · paid into ${beneficiary.label}`}
          />
          <RedeemPointsForm
            scope={beneficiary.type}
            balance={balance.available}
            minimum={MIN_REDEEMABLE_POINTS}
            rateLabel={rateLabel}
          />
        </Card>
      </div>

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-4">
          <Card>
            <SectionHeading title="How you earn" subtitle={PROGRAMME_LABEL[programme]} />
            <ol className="space-y-3 text-sm">
              <Step
                n={1}
                title="Share your code"
                body="Anyone who signs up with it is linked to you permanently."
              />
              <Step
                n={2}
                title="They place and complete a real order"
                body={`Qualifying orders only — the reward is paid on completed trade, not on sign-ups.`}
              />
              <Step
                n={3}
                title={`You earn ${formatPoints(perReferral)}`}
                body={`Worth ${formatMoney(pointsToMinor(perReferral))} at today's rate, credited to ${beneficiary.label}.`}
              />
              <Step
                n={4}
                title="Convert to cash whenever you like"
                body={`Points move into your spendable wallet balance from ${MIN_REDEEMABLE_POINTS.toLocaleString('en-NG')} points upwards.`}
              />
            </ol>
          </Card>

          <Card>
            <SectionHeading
              title="Your referrals"
              subtitle="Everyone who joined on your invitation"
            />
            {referrals.length ? (
              <div className="scroll-x">
                <table className="w-full min-w-[30rem] text-sm">
                  <caption className="sr-only">People you referred</caption>
                  <thead>
                    <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-medium">Member</th>
                      <th className="py-2 pr-3 font-medium">Joined</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((referral) => (
                      <tr key={referral.id} className="border-b border-line-soft last:border-0">
                        <td className="py-2.5 pr-3">
                          <span className="block text-ink">{referral.referred_name}</span>
                          <span className="block text-xs capitalize text-muted">
                            {referral.referred_role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 font-technical text-xs text-muted">
                          {new Date(referral.created_at).toLocaleDateString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 pr-3">
                          {referral.status === 'rewarded' ? (
                            <Badge tone="success">Rewarded</Badge>
                          ) : referral.status === 'void' ? (
                            <Badge tone="neutral">Void</Badge>
                          ) : (
                            <Badge tone="warning">Awaiting first order</Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right font-medium text-ink">
                          {referral.points_awarded > 0
                            ? formatPoints(referral.points_awarded)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="user"
                title="No one has used your code yet"
                body="Share it with someone who buys what you buy. You earn the moment their first order completes."
              />
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Points statement"
              subtitle="Points are ledger entries like any other — every line is auditable"
            />
            <Statement lines={lines} unit="points" />
          </Card>
        </div>

        <div className="space-y-4">
          {invitedBy && (
            <Card>
              <SectionHeading title="You were invited by" />
              <p className="text-sm text-ink">{invitedBy.name}</p>
              <p className="mt-1 text-xs text-muted">
                {invitedBy.status === 'rewarded'
                  ? 'Their reward has been paid.'
                  : 'They earn once your first order completes.'}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Names the invitation after who is being invited. "Invite" alone left a
 * retailer looking for the words "another retailer" and not finding them.
 */
function inviteHeading(programme: Programme): string {
  switch (programme) {
    case 'outlet':
      return 'Invite another retail outlet'
    case 'merchant':
      return 'Invite another merchant'
    case 'warehouse':
      return 'Invite another dealer warehouse'
    case 'manufacturer':
      return 'Invite another manufacturer'
    default:
      return 'Invite a shopper'
  }
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-technical text-xs font-semibold text-accent-strong">
        {n}
      </span>
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{body}</span>
      </span>
    </li>
  )
}
