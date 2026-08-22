import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { RewardsView } from '@/components/rewards/RewardsView'
import { PageHeader } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { ORG_LABEL, supplierTypeFor, type OrgType } from '@/lib/tiers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rewards' }

/**
 * The business rewards screen — the same programme, one tier up.
 *
 * A retail outlet invites another retail outlet to the merchant it buys from;
 * a merchant invites another merchant to its dealer warehouse. The reward is
 * paid to the business, not to the person who happens to own it.
 */
export default async function PartnerRewardsPage() {
  const user = await requireUser('/partner/rewards')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const supplier = supplierTypeFor(org.tier_level)
  const peer = ORG_LABEL[org.type as OrgType].toLowerCase()

  return (
    <PartnerShell active="/partner/rewards">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Rewards' }]}
          title="Rewards"
          subtitle={
            supplier
              ? `Invite another ${peer} to source from ${ORG_LABEL[supplier].toLowerCase()}s on AfriMesh. You earn points when they buy, and points convert into your business wallet.`
              : `Invite another ${peer} onto the network. You earn points when they trade, and points convert into your business wallet.`
          }
        />
        <RewardsView userId={user.id} role={user.role} />
      </div>
    </PartnerShell>
  )
}
