import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Thread } from '@/components/messaging/Thread'
import { OrderStatusBadge } from '@/components/commerce/OrderBits'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { SectionHeading, Breadcrumb, Card, Thumb } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { getOrder } from '@/modules/orders/service'
import { readThread, MessagingError } from '@/modules/messaging/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversation' }

export default async function ThreadPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const user = await requireUser(`/messages/${orderId}`)
  const org = await currentOrganisation()

  const order = await getOrder(orderId)
  if (!order) notFound()

  let thread
  try {
    thread = await readThread(orderId, user.id, org?.id ?? null)
  } catch (err) {
    // Not a party to this order — indistinguishable from it not existing.
    if (err instanceof MessagingError) notFound()
    throw err
  }

  const counterpart =
    thread.side === 'buyer' ? order.seller_name : (order.buyer_org_name ?? order.buyer_name)

  return (
    <ConsumerShell search={false}>
      <div className="space-y-4">
        <Breadcrumb
          trail={[
            { label: 'Home', href: '/' },
            { label: 'Messages', href: '/messages' },
            { label: counterpart },
          ]}
        />

        <Card className="flex flex-wrap items-center gap-3">
          {thread.side === 'buyer' ? (
            <SellerThumb name={counterpart} logoUrl={order.seller_logo} size="md" />
          ) : (
            <Thumb alt={counterpart} size="md" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{counterpart}</p>
            <p className="font-technical text-xs text-muted">
              {order.order_number} · {formatMoney(order.total, order.currency)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} fulfilment={order.fulfilment} />
          <Link
            href={thread.side === 'seller' ? `/partner/orders/${order.id}` : `/orders/${order.id}`}
            className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            View order
          </Link>
        </Card>

        <Card>
          <SectionHeading
            title="Conversation"
            subtitle="Both of you can see everything here. It stays attached to this order."
          />
          <Thread
            orderId={order.id}
            messages={thread.messages}
            side={thread.side}
            counterpartName={counterpart}
          />
        </Card>
      </div>
    </ConsumerShell>
  )
}
