import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { CheckoutForm } from '@/components/commerce/CheckoutForm'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui'
import { clearCartAction, updateCartQtyAction } from '@/app/actions/cart'
import { currentUser } from '@/lib/auth'
import { hydrateCart } from '@/lib/cart'
import { buyerLocation } from '@/lib/location'
import { formatMoney, platformFee } from '@/lib/money'
import { formatDistance, formatEta, haversineKm, estimateEtaMinutes } from '@/lib/geo'
import { TIER } from '@/lib/tiers'
import { deliveryFeeFor } from '@/modules/orders/service'
import { getBalance } from '@/modules/wallet/service'

export const dynamic = 'force-dynamic'

export default async function CartPage() {
  const [user, cart, location] = await Promise.all([currentUser(), hydrateCart(), buyerLocation()])

  if (!cart.seller || !cart.lines.length) {
    return (
      <ConsumerShell>
        <EmptyState
          icon="basket"
          title="Your basket is empty"
          body="Search for what you need and we will show you which nearby shops actually have it."
          action={<LinkButton href="/search">Start shopping</LinkButton>}
        />
      </ConsumerShell>
    )
  }

  const isConsumerBasket = cart.tier === TIER.consumer
  const distance = haversineKm(location, { lat: cart.seller.lat, lng: cart.seller.lng })
  const deliveryFee = deliveryFeeFor(distance, 'delivery')
  const fee = platformFee(cart.subtotal)
  const total = cart.subtotal + deliveryFee
  const eta = estimateEtaMinutes(distance, cart.seller.avg_dispatch_minutes)

  const wallet = user ? await getBalance('user', user.id) : null

  return (
    <ConsumerShell search={false}>
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Basket' }]}
          title="Your basket"
          subtitle={`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} from ${cart.seller.name}`}
          actions={
            <form action={clearCartAction}>
              <ConfirmSubmitButton
                message="Clear your basket? This removes every item and can't be undone."
                className="text-sm text-muted hover:text-coral-ink"
              >
                Clear
              </ConfirmSubmitButton>
            </form>
          }
        />

        {!isConsumerBasket && (
          <Alert tone="info">
            This is a business restock basket at wholesale prices, delivered to your premises.
          </Alert>
        )}

        {cart.hasIssues && (
          <Alert tone="warning">
            Some items now exceed what the seller has in stock. Reduce the quantity to continue.
          </Alert>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-3">
            <Card className="flex items-center gap-3">
              <SellerThumb name={cart.seller.name} size="sm" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/shop/${cart.seller.slug}`}
                  className="font-semibold text-ink hover:text-accent-strong"
                >
                  {cart.seller.name}
                </Link>
                <p className="text-xs text-muted">
                  {formatDistance(distance)} away · about {formatEta(eta)}
                </p>
              </div>
            </Card>

            {cart.lines.map((line) => (
              <Card key={line.inventory_item_id} className="flex items-center gap-3">
                <ProductThumb name={line.name} imageUrl={line.image_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{line.name}</p>
                  <p className="text-xs text-muted">
                    {formatMoney(line.unit_price)} per {line.pack_size ?? line.unit_of_measure}
                  </p>
                  {line.over_stock && (
                    <Badge tone="danger" className="mt-1">
                      Only {line.qty_available} available
                    </Badge>
                  )}
                </div>

                <form action={updateCartQtyAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="inventoryItemId" value={line.inventory_item_id} />
                  <label className="sr-only" htmlFor={`qty-${line.inventory_item_id}`}>
                    Quantity for {line.name}
                  </label>
                  <input
                    id={`qty-${line.inventory_item_id}`}
                    type="number"
                    name="qty"
                    defaultValue={line.qty}
                    min={0}
                    max={line.qty_available}
                    className="w-16 rounded-brand border border-line px-2 py-1.5 text-center text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-brand border border-line px-2 py-1.5 text-xs font-medium hover:bg-surface-muted"
                  >
                    Update
                  </button>
                </form>

                <p className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">
                  {formatMoney(line.line_total)}
                </p>
              </Card>
            ))}
          </div>

          <aside className="space-y-3">
            <Card>
              <h2 className="mb-3 font-semibold text-ink">Order summary</h2>
              <dl className="space-y-2 text-sm">
                <Row label="Subtotal" value={formatMoney(cart.subtotal)} />
                <Row label="Delivery" value={formatMoney(deliveryFee)} />
                <Row
                  label="Platform fee"
                  value={formatMoney(fee)}
                  hint="Paid by the seller from the order value"
                  muted
                />
                <div className="border-t border-line-soft pt-2">
                  <Row label="Total to pay" value={formatMoney(total)} bold />
                </div>
              </dl>
            </Card>

            <Card>
              {user ? (
                <>
                  <p className="mb-3 text-sm text-muted">
                    Wallet balance:{' '}
                    <span className="font-semibold text-ink">
                      {formatMoney(wallet?.available ?? 0)}
                    </span>
                  </p>
                  <CheckoutForm
                    walletBalance={wallet?.available ?? 0}
                    total={total}
                    defaultAddress={
                      isConsumerBasket
                        ? (user.default_address ?? location.label)
                        : (cart.seller.address ?? '')
                    }
                  />
                </>
              ) : (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted">Sign in to complete your order.</p>
                  <LinkButton href="/login?next=/cart" full>
                    Sign in to continue
                  </LinkButton>
                </div>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </ConsumerShell>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
  hint,
}: {
  label: string
  value: string
  bold?: boolean
  muted?: boolean
  hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className={muted ? 'text-muted' : 'text-ink'}>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </dt>
      <dd
        className={`shrink-0 ${bold ? 'text-base font-bold text-ink' : muted ? 'text-muted' : 'font-medium text-ink'}`}
      >
        {value}
      </dd>
    </div>
  )
}
