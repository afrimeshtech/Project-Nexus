import { redirect } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { RewardsView } from '@/components/rewards/RewardsView'
import { PageHeader } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { can } from '@/lib/org-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rewards' }

/**
 * The shopper's rewards screen. A consumer invites other consumers to the
 * shops they already buy from, and earns on their first completed order.
 */
export default async function RewardsPage() {
  const user = await requireUser('/rewards')

  // A business owner reaching this from the storefront menu belongs on the
  // business programme: they invite another shop like theirs, their points are
  // held by the business, and this page's shopper wording would tell them the
  // wrong thing about both.
  // A sales rep is not: the business's points are the owner's, and the rep's
  // own invitations earn for the rep, like any shopper's.
  const org = await currentOrganisation()
  if (org && can(org.member_role, 'rewards')) redirect('/partner/rewards')

  return (
    <ConsumerShell search={false}>
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Rewards' }]}
          title="Rewards"
          subtitle="Invite people to shop where you shop. Earn points on every referral that buys, and turn them into cash."
        />
        <RewardsView userId={user.id} role={user.role} />
      </div>
    </ConsumerShell>
  )
}
