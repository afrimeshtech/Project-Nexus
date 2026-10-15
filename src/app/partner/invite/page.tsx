import { PartnerShell } from '@/components/shell/PartnerShell'
import { InviteView } from '@/components/rewards/InviteView'
import { PageHeader } from '@/components/ui'
import { requireOrgCapability } from '@/lib/auth'
import { ORG_LABEL, type OrgType } from '@/lib/tiers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invite shops' }

/**
 * A business inviting its peers - another retail outlet invites a retail
 * outlet. Same capability as the rewards screen, which this stands in for
 * until the rewards programme launches (FUTURE-REWARDS).
 */
export default async function PartnerInvitePage() {
  const { user, org } = await requireOrgCapability('rewards', '/partner/invite')
  const peer = ORG_LABEL[org.type as OrgType].toLowerCase()

  return (
    <PartnerShell active="/partner/invite">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Invite shops' }]}
          title="Invite shops"
          subtitle={`Bring another ${peer} onto AfriMesh. Share your invite link; when they sign up with it, they show up below.`}
        />
        <InviteView userId={user.id} role={user.role} />
      </div>
    </PartnerShell>
  )
}
