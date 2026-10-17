import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { SupportThreadList } from '@/components/support/SupportViews'
import { Card, PageHeader, SectionHeading } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { recentVisitorMessages, supportThreadsForAdmin } from '@/modules/support/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support inbox' }

const FILTERS = ['open', 'closed', 'all'] as const
type Filter = (typeof FILTERS)[number]

/**
 * Every conversation shoppers and retailers have opened with AfriMesh, newest
 * activity first, and below them the messages signed-out visitors left with
 * an email address - those are answered by email.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireRole(ADMIN_ROLES, '/admin/support')
  const requested = (await searchParams).status
  const status: Filter = FILTERS.includes(requested as Filter) ? (requested as Filter) : 'open'

  const [threads, visitors] = await Promise.all([
    supportThreadsForAdmin(status),
    recentVisitorMessages(20),
  ])

  return (
    <AdminShell active="/admin/support">
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Support inbox' }]}
          title="Support inbox"
          subtitle="Conversations shoppers and retailers have opened from Contact us. Your reply reaches them in the app, with a notification."
          actions={
            <div className="flex gap-1.5">
              {FILTERS.map((option) => (
                <Link
                  key={option}
                  href={`/admin/support?status=${option}`}
                  className={`rounded-full px-3.5 py-2 text-xs font-medium capitalize ${
                    status === option
                      ? 'bg-accent-500 text-accent-ink'
                      : 'border border-line bg-surface text-muted'
                  }`}
                >
                  {option}
                </Link>
              ))}
            </div>
          }
        />

        <SupportThreadList
          threads={threads}
          hrefFor={(id) => `/admin/support/${id}`}
          perspective="admin"
          emptyBody={
            status === 'open'
              ? 'No open conversations. New messages from shoppers and retailers land here.'
              : 'Nothing here.'
          }
        />

        <Card>
          <SectionHeading
            title="From signed-out visitors"
            subtitle="Left on the public Contact us form. They have no account, so reply by email."
          />
          {visitors.length ? (
            <ul className="divide-y divide-line-soft">
              {visitors.map((v) => (
                <li key={v.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {v.name}{' '}
                      <a
                        href={`mailto:${v.email}`}
                        className="font-normal text-accent-strong underline"
                      >
                        {v.email}
                      </a>
                    </p>
                    <span className="font-technical text-xs text-muted">
                      {new Date(v.created_at).toLocaleString('en-NG')} · {v.source}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{v.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No messages from visitors yet.</p>
          )}
        </Card>
      </div>
    </AdminShell>
  )
}
