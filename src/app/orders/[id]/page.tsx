import { notFound } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { OrderDetailView } from '@/components/commerce/OrderDetailView'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { can } from '@/lib/org-access'
import { getOrder } from '@/modules/orders/service'
import { expireStaleReservations } from '@/modules/inventory/service'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ payment?: string; reason?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const user = await requireUser(`/orders/${id}`)

  // Opportunistic sweep: viewing an order is a natural moment to release holds
  // that timed out, so an abandoned checkout cannot strand someone's stock.
  await expireStaleReservations()

  const order = await getOrder(id)
  if (!order) notFound()

  const org = await currentOrganisation()
  const isBuyer = order.buyer_user_id === user.id
  const isSeller = org?.id === order.seller_org_id
  if (!isBuyer && !isSeller) notFound()

  return (
    <ConsumerShell search={false}>
      <OrderDetailView
        order={order}
        viewer={{
          isBuyer,
          isSeller,
          canSeeFunds: org ? can(org.member_role, 'funds') : true,
        }}
        payment={{ status: query.payment, reason: query.reason }}
      />
    </ConsumerShell>
  )
}
