import { notFound, redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { OrderDetailView } from '@/components/commerce/OrderDetailView'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { can } from '@/lib/org-access'
import { deliveryLaunched } from '@/lib/launch-fulfilment'
import { getOrder } from '@/modules/orders/service'
import { ridersForShop } from '@/modules/logistics/service'

export const dynamic = 'force-dynamic'

/** The same order record as the buyer sees, framed by the seller's dashboard. */
export default async function PartnerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/partner/orders/${id}`)
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const order = await getOrder(id)
  if (!order) notFound()

  const isSeller = order.seller_org_id === org.id
  const isBuyer = order.buyer_user_id === user.id || order.buyer_org_id === org.id
  if (!isSeller && !isBuyer) notFound()

  // Only looked up while there is still a rider to choose: a delivery order
  // being prepared, or dispatched and not yet claimed. FUTURE-DELIVERY: with
  // delivery off there are no riders to choose, so the dispatch box stays shut
  // and the seller moves an older delivery order along themselves.
  const choosingRider =
    deliveryLaunched() &&
    isSeller &&
    can(org.member_role, 'dispatch') &&
    order.fulfilment === 'delivery' &&
    ['preparing', 'dispatched'].includes(order.status)
  const riders = choosingRider
    ? await ridersForShop({ orgId: org.id, lat: org.lat, lng: org.lng })
    : undefined

  return (
    <PartnerShell active="/partner/orders">
      <OrderDetailView
        order={order}
        viewer={{
          isBuyer: isBuyer && !isSeller,
          isSeller,
          canSeeFunds: can(org.member_role, 'funds'),
        }}
        riders={riders}
      />
    </PartnerShell>
  )
}
