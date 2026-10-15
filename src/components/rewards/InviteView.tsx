import { InviteCard } from '@/components/rewards/RewardsForms'
import { inviteHeading } from '@/components/rewards/RewardsView'
import { Badge, Card, EmptyState, SectionHeading } from '@/components/ui'
import { programmeForRole } from '@/lib/points'
import { referralCodeFor, referralsFor } from '@/modules/rewards/service'

/**
 * Inviting, without the rewards around it.
 *
 * The full `RewardsView` leads with points, cash value and a points statement.
 * FUTURE-REWARDS: until the programme launches, a business can still invite
 * its peers and see who joined, but nothing here mentions points or money.
 * Referrals are still recorded the same way, so nothing is lost when the
 * rewards screen comes back.
 */
export async function InviteView({ userId, role }: { userId: string; role: string }) {
  const [code, referrals] = await Promise.all([referralCodeFor(userId), referralsFor(userId, 50)])

  return (
    <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[21rem_1fr]">
      <Card>
        <SectionHeading
          title={inviteHeading(programmeForRole(role))}
          subtitle="Anyone who signs up with your code or link is linked to your business"
        />
        <InviteCard code={code} />
      </Card>

      <Card>
        <SectionHeading title="Your invitations" subtitle="Everyone who joined with your code" />
        {referrals.length ? (
          <div className="scroll-x">
            <table className="w-full min-w-[26rem] text-sm">
              <caption className="sr-only">Businesses you invited</caption>
              <thead>
                <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Joined</th>
                  <th className="py-2 font-medium">Status</th>
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
                    <td className="py-2.5">
                      {referral.status === 'rewarded' ? (
                        <Badge tone="success">Has ordered</Badge>
                      ) : referral.status === 'void' ? (
                        <Badge tone="neutral">Void</Badge>
                      ) : (
                        <Badge tone="warning">Awaiting first order</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="user"
            title="No one has joined with your code yet"
            body="Share your invite link with another shop. It appears here as soon as they sign up."
          />
        )}
      </Card>
    </div>
  )
}
