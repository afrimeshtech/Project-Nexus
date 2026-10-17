import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { NewSupportThreadForm } from '@/components/support/SupportForms'
import { SupportThreadList } from '@/components/support/SupportViews'
import { Card, PageHeader, SectionHeading } from '@/components/ui'
import { currentOrganisation, requireUser } from '@/lib/auth'
import { supportThreadsForUser } from '@/modules/support/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contact AfriMesh' }

/**
 * A retailer's line to AfriMesh, inside the dashboard: moving the shop,
 * verification, payouts. Owners and sales reps alike can write; each sees
 * their own conversations.
 */
export default async function PartnerSupportPage() {
  const user = await requireUser('/partner/support')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const threads = await supportThreadsForUser(user.id, 'partner')

  return (
    <PartnerShell active="/partner/support">
      <div className="max-w-2xl space-y-6">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Contact AfriMesh' }]}
          title="Contact AfriMesh"
          subtitle="Write to the AfriMesh team about your shop. We reply here, and you get a notification when we do."
        />
        <Card>
          <SectionHeading title="New message" />
          <NewSupportThreadForm source="partner" />
        </Card>
        <section className="space-y-3">
          <SectionHeading title="Your conversations" />
          <SupportThreadList
            threads={threads}
            hrefFor={(id) => `/partner/support/${id}`}
            perspective="member"
            emptyBody="Anything you send us appears here, with our replies."
          />
        </section>
      </div>
    </PartnerShell>
  )
}
