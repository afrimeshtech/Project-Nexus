import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { OfferCard } from '@/components/commerce/OfferCard'
import { RestockButton } from '@/components/partner/RestockButton'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Rating,
  SectionHeading,
} from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { sourcingContext } from '@/lib/viewer'
import { ORG_LABEL, supplierTypeFor } from '@/lib/tiers'
import { formatDistance, formatEta } from '@/lib/geo'
import { formatMoney } from '@/lib/money'
import { rankOffers, rankSellers } from '@/modules/recommendation/service'
import { listInventory } from '@/modules/inventory/service'
import { hydrateCart } from '@/lib/cart'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Source stock' }

/**
 * B2B procurement.
 *
 * This is the same discovery engine the consumer storefront uses, run at the
 * business's own tier: it ranks suppliers one level up, at wholesale prices,
 * delivering to the business's premises. It closes the loop the PRD describes
 * for retailers — "replenish stock quickly and affordably" without "multiple
 * supplier calls".
 */
export default async function SourcePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; radius?: string }>
}) {
  const params = await searchParams
  await requireUser('/partner/source')
  const ctx = await sourcingContext()
  if (!ctx) redirect('/onboarding')

  const supplier = supplierTypeFor(ctx.tier)
  if (!supplier) {
    return (
      <PartnerShell active="/partner/source">
        <EmptyState
          icon="factory"
          title="You are at the top of the chain"
          body="Manufacturers produce goods rather than sourcing them on the network."
        />
      </PartnerShell>
    )
  }

  const radius = Number(params.radius ?? 150)
  const buyer = { lat: ctx.lat, lng: ctx.lng, tier: ctx.tier, userId: null }

  const [offers, suppliers, lowStock, cart] = await Promise.all([
    params.q
      ? rankOffers(buyer, { query: params.q }, { maxDistanceKm: radius, limit: 40 })
      : Promise.resolve([]),
    rankSellers(buyer, { maxDistanceKm: radius, limit: 8 }),
    listInventory(ctx.orgId, { lowOnly: true, limit: 8 }),
    hydrateCart(),
  ])

  return (
    <PartnerShell active="/partner/source">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Sourcing' }]}
          title={`Source from ${ORG_LABEL[supplier].toLowerCase()}s`}
          subtitle={`Wholesale prices, ranked by stock depth, distance, price and dispatch reliability. Delivered to ${ctx.address ?? ctx.orgName}.`}
        />

        {cart.seller && cart.lines.length > 0 && cart.tier === ctx.tier && (
          <Alert tone="info">
            You have {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'} from {cart.seller.name}{' '}
            worth {formatMoney(cart.subtotal)} ready to order.{' '}
            <Link href="/cart" className="font-semibold underline">
              Go to basket
            </Link>
          </Alert>
        )}

        <Card>
          <SectionHeading
            title="Restock in one step"
            subtitle="Everything at or below its reorder level, sourced from a single supplier"
          />
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div>
              {lowStock.length ? (
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((item) => (
                    <Link
                      key={item.id}
                      href={`/partner/source?q=${encodeURIComponent(item.product_name)}`}
                      className="rounded-full border border-warning/50 bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning-ink hover:border-warning"
                    >
                      {item.product_name} · {item.qty_available} left
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Every product you list is above its reorder level.
                </p>
              )}
            </div>
            <RestockButton lowCount={lowStock.length} />
          </div>
        </Card>

        <Card>
          <form className="flex flex-wrap items-end gap-2" action="/partner/source">
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="src-q">
                What do you need to restock?
              </label>
              <input
                id="src-q"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Product name, brand or barcode"
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="src-r">
                Within (km)
              </label>
              <input
                id="src-r"
                name="radius"
                type="number"
                min={5}
                defaultValue={radius}
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink"
            >
              Find suppliers
            </button>
          </form>
        </Card>

        {params.q && (
          <section>
            <SectionHeading
              title={`${offers.length} wholesale offer${offers.length === 1 ? '' : 's'} for “${params.q}”`}
              subtitle="Minimum order quantities apply at wholesale tiers"
            />
            {offers.length ? (
              <div className="space-y-3">
                {offers.map((offer, index) => (
                  <OfferCard
                    key={offer.inventory_item_id}
                    offer={offer}
                    rank={index + 1}
                    mode="sourcing"
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="inbox"
                title="No supplier within range has that in stock"
                body={`No verified ${ORG_LABEL[supplier].toLowerCase()} within ${radius} km has it available right now. Try widening the radius.`}
              />
            )}
          </section>
        )}

        <section>
          <SectionHeading
            title={`${ORG_LABEL[supplier]}s near you`}
            subtitle="Verified suppliers you are permitted to buy from"
          />
          {suppliers.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {suppliers.map((s) => (
                <Card key={s.id} className="flex items-center gap-3">
                  <SellerThumb name={s.name} logoUrl={s.logo_url} type={s.type} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{s.name}</p>
                    <p className="truncate text-xs text-muted">{s.city}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{formatDistance(s.distance_km)}</span>
                      <span>· {formatEta(s.eta_minutes)}</span>
                      <Rating value={s.rating} count={s.rating_count} />
                    </div>
                    <Badge tone="neutral" className="mt-1.5">
                      {s.sku_count} products · {s.units_available.toLocaleString()} units
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="factory"
              title={`No verified ${ORG_LABEL[supplier].toLowerCase()}s within ${radius} km`}
              body="Widen your search radius, or check back as more businesses join the network."
              action={
                <LinkButton href="/partner/source?radius=400" variant="secondary">
                  Search within 400 km
                </LinkButton>
              }
            />
          )}
        </section>
      </div>
    </PartnerShell>
  )
}
