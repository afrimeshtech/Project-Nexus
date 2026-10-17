import { notFound } from 'next/navigation'
import { AdminShell } from '@/components/shell/AdminShell'
import { SupportReplyForm } from '@/components/support/SupportForms'
import { SupportConversation } from '@/components/support/SupportViews'
import { setSupportStatusAction } from '@/app/actions/support'
import { Badge, Card, PageHeader } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { getSql } from '@/db/client'
import { readSupportThread, supportThreadFor } from '@/modules/support/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support conversation' }

/** One conversation, answered as AfriMesh. Auditors can read, not reply. */
export default async function AdminSupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = await requireRole(ADMIN_ROLES, `/admin/support/${id}`)
  const thread = await supportThreadFor(id, { userId: admin.id, isAdmin: true })
  if (!thread) notFound()
  const readOnly = admin.role === 'auditor'

  // An auditor reading the thread must not mark it read for the team.
  const sql = await getSql()
  const messages = readOnly
    ? await sql.query<Parameters<typeof SupportConversation>[0]['messages'][number]>(
        `SELECT m.id, m.thread_id, m.sender_side, u.full_name AS sender_name, m.body, m.read_at,
                m.created_at
           FROM support_messages m LEFT JOIN users u ON u.id = m.sender_user_id
          WHERE m.thread_id = $1 ORDER BY m.created_at`,
        [thread.id],
      )
    : await readSupportThread(thread, 'admin')
  const member = await sql.one<{ full_name: string; phone: string | null; email: string | null }>(
    `SELECT full_name, phone, email FROM users WHERE id = $1`,
    [thread.user_id],
  )
  const org = thread.organisation_id
    ? await sql.one<{ name: string; slug: string }>(
        `SELECT name, slug FROM organisations WHERE id = $1`,
        [thread.organisation_id],
      )
    : null

  return (
    <AdminShell active="/admin/support">
      <div className="max-w-3xl space-y-6">
        <PageHeader
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'Support inbox', href: '/admin/support' },
            { label: thread.subject },
          ]}
          title={thread.subject}
          subtitle={[
            thread.source === 'partner' ? 'Retailer' : 'Shopper',
            member?.full_name,
            org?.name,
            member?.phone,
            member?.email,
          ]
            .filter(Boolean)
            .join(' · ')}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={thread.status === 'open' ? 'brand' : 'neutral'}>{thread.status}</Badge>
              {!readOnly && (
                <form action={setSupportStatusAction}>
                  <input type="hidden" name="threadId" value={thread.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={thread.status === 'open' ? 'closed' : 'open'}
                  />
                  <button
                    type="submit"
                    className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
                  >
                    {thread.status === 'open' ? 'Mark closed' : 'Reopen'}
                  </button>
                </form>
              )}
            </div>
          }
        />
        <Card className="space-y-5">
          <SupportConversation messages={messages} viewerSide="admin" />
          {readOnly ? (
            <p className="text-xs text-muted">Auditors can read conversations but not reply.</p>
          ) : (
            <SupportReplyForm threadId={thread.id} admin />
          )}
        </Card>
      </div>
    </AdminShell>
  )
}
