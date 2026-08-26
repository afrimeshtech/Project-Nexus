import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  SectionHeading,
  Thumb,
} from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { threadsForBuyer, threadsForSeller, type ThreadSummary } from '@/modules/messaging/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Messages' }

/**
 * Inbox. A business owner sees both sides: the conversations customers started
 * with their shop, and the ones they started with their own suppliers.
 */
export default async function MessagesPage() {
  const user = await requireUser('/messages')
  const org = await currentOrganisation()

  const [asBuyer, asSeller] = await Promise.all([
    threadsForBuyer(user.id),
    org ? threadsForSeller(org.id) : Promise.resolve([] as ThreadSummary[]),
  ])

  if (!asBuyer.length && !asSeller.length) {
    return (
      <ConsumerShell search={false}>
        <EmptyState
          icon="chat"
          title="No messages yet"
          body="Conversations are attached to an order, so you can ask a seller about something you actually bought. Open any order and start a message."
          action={<LinkButton href="/orders">View your orders</LinkButton>}
        />
      </ConsumerShell>
    )
  }

  return (
    <ConsumerShell search={false}>
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Messages' }]}
          title="Messages"
          subtitle="Every conversation stays attached to the order it is about."
        />

        {asSeller.length > 0 && (
          <section>
            <SectionHeading
              title="From your customers"
              subtitle={`Messages about orders placed with ${org?.name}`}
            />
            <ThreadList threads={asSeller} viewerSide="seller" />
          </section>
        )}

        {asBuyer.length > 0 && (
          <section>
            <SectionHeading
              title={asSeller.length ? 'Your purchases' : 'Messages'}
              subtitle="Conversations about orders you placed"
            />
            <ThreadList threads={asBuyer} viewerSide="buyer" />
          </section>
        )}
      </div>
    </ConsumerShell>
  )
}

function ThreadList({
  threads,
  viewerSide,
}: {
  threads: ThreadSummary[]
  viewerSide: 'buyer' | 'seller'
}) {
  return (
    <div className="space-y-2">
      {threads.map((thread) => {
        const counterpart =
          viewerSide === 'buyer' ? thread.seller_name : (thread.buyer_org_name ?? thread.buyer_name)
        return (
          <Link key={thread.id} href={`/messages/${thread.order_id}`} className="block min-w-0">
            <Card className="flex items-center gap-3 card-interactive hover:card-interactive-hover">
              {/* A shopfront mark only when the counterpart is a shop. Facing a
                  buyer, the counterpart is a person, and drawing them a
                  storefront would be a lie. */}
              {viewerSide === 'buyer' ? (
                <SellerThumb name={counterpart} logoUrl={thread.seller_logo} size="md" />
              ) : (
                <Thumb alt={counterpart} size="md" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-ink">{counterpart}</p>
                  {thread.unread > 0 && <Badge tone="brand">{thread.unread} new</Badge>}
                </div>
                <p className="truncate text-sm text-muted">
                  {thread.last_side === viewerSide && 'You: '}
                  {thread.last_body ?? 'No messages yet'}
                </p>
                <p className="font-technical text-xs text-muted">
                  {thread.order_number} ·{' '}
                  {new Date(thread.last_message_at).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
