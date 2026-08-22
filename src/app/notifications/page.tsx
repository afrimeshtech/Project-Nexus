import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { listNotifications, markAllRead } from '@/modules/notifications/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const user = await requireUser('/notifications')
  const notifications = await listNotifications(user.id, 40)

  async function markRead() {
    'use server'
    const current = await requireUser('/notifications')
    await markAllRead(current.id)
  }

  return (
    <ConsumerShell search={false}>
      <div className="space-y-4">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Notifications' }]}
          title="Notifications"
          subtitle="Order updates, account changes and stock alerts"
          actions={
            notifications.some((n) => !n.read_at) ? (
              <form action={markRead}>
                <button
                  type="submit"
                  className="text-sm font-medium text-accent-strong hover:underline"
                >
                  Mark all read
                </button>
              </form>
            ) : null
          }
        />

        {notifications.length ? (
          <div className="space-y-2">
            {notifications.map((n) => {
              const body = (
                <Card
                  className={`flex gap-3 ${n.read_at ? '' : 'border-accent-500/40 bg-accent-soft/40'}`}
                >
                  <span className="mt-0.5 text-muted">
                    <Icon
                      name={
                        n.category === 'order'
                          ? 'box'
                          : n.category === 'account'
                            ? 'user'
                            : n.category === 'delivery'
                              ? 'scooter'
                              : n.category === 'message'
                                ? 'chat'
                                : n.category === 'reward'
                                  ? 'wallet'
                                  : 'bell'
                      }
                      size={20}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{n.title}</p>
                      {!n.read_at && <Badge tone="brand">New</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                    <p className="mt-1 font-technical text-xs text-muted">
                      {new Date(n.created_at).toLocaleString('en-NG')} ·{' '}
                      {n.channel.replace('_', '-')}
                    </p>
                  </div>
                </Card>
              )

              return n.reference_type === 'order' && n.reference_id ? (
                <Link key={n.id} href={`/orders/${n.reference_id}`} className="block">
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon="bell"
            title="Nothing yet"
            body="Order and account updates will appear here."
          />
        )}
      </div>
    </ConsumerShell>
  )
}
