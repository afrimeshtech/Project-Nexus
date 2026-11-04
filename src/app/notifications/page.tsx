import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Icon } from '@/components/Icon'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import {
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
} from '@/modules/notifications/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notifications' }

// Where tapping a notification goes: the order, or the support conversation
// in whichever shell it belongs to. Null when there is nothing to open.
function hrefFor(n: Notification): string | null {
  if (!n.reference_id) return null
  switch (n.reference_type) {
    case 'order':
      return `/orders/${n.reference_id}`
    case 'support':
      return `/contact/${n.reference_id}`
    case 'support_partner':
      return `/partner/support/${n.reference_id}`
    case 'support_admin':
      return `/admin/support/${n.reference_id}`
    default:
      return null
  }
}

export default async function NotificationsPage() {
  const user = await requireUser('/notifications')
  const notifications = await listNotifications(user.id, 40)

  // A notification with nothing to open has been fully seen once it is on
  // screen, so clear it now; otherwise "Mark all read" was the only way to stop
  // the bell counting it. Linked ones clear when their order or conversation is
  // opened. This runs before the shell renders, so the bell is already right.
  // The list above was fetched first, so they still show as New on this visit.
  await markRead(
    user.id,
    notifications.filter((n) => !n.read_at && !hrefFor(n)).map((n) => n.id),
  )

  async function markAllReadAction() {
    'use server'
    const current = await requireUser('/notifications')
    await markAllRead(current.id)
    // Without this the action wrote to the database and the page kept showing
    // the old badge and New tags until the next navigation.
    revalidatePath('/', 'layout')
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
              <form action={markAllReadAction}>
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
                                : n.category === 'support'
                                  ? 'mail'
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

              const href = hrefFor(n)
              return href ? (
                <Link key={n.id} href={href} className="block">
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
