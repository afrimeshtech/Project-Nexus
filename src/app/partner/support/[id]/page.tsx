import { notFound, redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { SupportReplyForm } from '@/components/support/SupportForms'
import { SupportConversation } from '@/components/support/SupportViews'
import { Badge, Card, PageHeader } from '@/components/ui'
import { currentOrganisation, requireUser } from '@/lib/auth'
import { readSupportThread, supportThreadFor } from '@/modules/support/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversation with AfriMesh' }

/** One conversation between a retailer and AfriMesh support. */
export default async function PartnerSupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser(`/partner/support/${id}`)
  if (!(await currentOrganisation())) redirect('/onboarding')
  const thread = await supportThreadFor(id, { userId: user.id, isAdmin: false })
  if (!thread) notFound()

  const messages = await readSupportThread(thread, 'member')

  return (
    <PartnerShell active="/partner/support">
      <div className="max-w-2xl space-y-6">
        <PageHeader
          breadcrumb={[
            { label: 'Dashboard', href: '/partner' },
            { label: 'Contact AfriMesh', href: '/partner/support' },
            { label: thread.subject },
          ]}
          title={thread.subject}
          subtitle="Your conversation with the AfriMesh team"
          actions={thread.status === 'closed' ? <Badge tone="neutral">Closed</Badge> : undefined}
        />
        <Card className="space-y-5">
          <SupportConversation messages={messages} viewerSide="member" />
          {thread.status === 'closed' && (
            <p className="text-xs text-muted">
              This conversation was closed. Replying opens it again.
            </p>
          )}
          <SupportReplyForm threadId={thread.id} />
        </Card>
      </div>
    </PartnerShell>
  )
}
