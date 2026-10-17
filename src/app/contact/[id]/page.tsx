import { notFound, redirect } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { SupportReplyForm } from '@/components/support/SupportForms'
import { SupportConversation } from '@/components/support/SupportViews'
import { Badge, Card, PageHeader } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { readSupportThread, supportThreadFor } from '@/modules/support/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversation with AfriMesh' }

/** One conversation between a shopper and AfriMesh support. */
export default async function ContactThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/contact/${id}`)
  const thread = await supportThreadFor(id, { userId: user.id, isAdmin: false })
  if (!thread) notFound()
  if (thread.source === 'partner') redirect(`/partner/support/${id}`)

  const messages = await readSupportThread(thread, 'member')

  return (
    <ConsumerShell search={false}>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          breadcrumb={[
            { label: 'Home', href: '/' },
            { label: 'Contact us', href: '/contact' },
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
    </ConsumerShell>
  )
}
