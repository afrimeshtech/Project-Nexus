import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { OfferCard } from '@/components/commerce/OfferCard'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Badge, Card, EmptyState, SectionHeading } from '@/components/ui'
import { toggleFavouriteProductAction } from '@/app/actions/cart'
import { currentUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { TIER } from '@/lib/tiers'
import { formatMoney } from '@/lib/money'
import { getProduct } from '@/modules/catalog/service'
import { offersForProduct, recordProductView } from '@/modules/search/service'
import { favouriteProductIds } from '@/modules/favourites/service'

export const dynamic = 'force-dynamic'

/**
 * Product page = price comparison. This is the screen that answers the BRS
 * problem statement directly: which nearby seller has it, at what price, how
 * far away, and can they be trusted.
 */
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProduct(decodeURIComponent(slug))
  if (!product) notFound()

  const [user, location] = await Promise.all([currentUser(), buyerLocation()])
  const ctx = {
    lat: location.lat,
    lng: location.lng,
    tier: TIER.consumer,
    userId: user?.id ?? null,
  }

  const offers = await offersForProduct(ctx, product.id, { maxDistanceKm: 40 })
  const favourites = user ? await favouriteProductIds(user.id) : new Set<string>()
  const isFavourite = favourites.has(product.id)

  // Demand intelligence: every view is a signal for Phase 3 forecasting.
  await recordProductView(product.id, user?.id ?? null)

  const best = offers[0]
  const cheapest = offers.reduce<number | null>(
    (min, o) => (min === null ? o.unit_price : Math.min(min, o.unit_price)),
    null,
  )
  const dearest = offers.reduce<number | null>(
    (max, o) => (max === null ? o.unit_price : Math.max(max, o.unit_price)),
    null,
  )

  return (
    <ConsumerShell>
      <div className="space-y-8">
        <nav className="text-xs text-muted">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          {product.category_name && (
            <>
              {' / '}
              <Link href={`/search?category=${product.category_id}`} className="hover:underline">
                {product.category_name}
              </Link>
            </>
          )}
        </nav>

        <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <ProductThumb
            name={product.name}
            imageUrl={product.image_url}
            brandLogo={product.brand_logo}
            categorySlug={product.category_slug}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-ink">{product.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {[product.brand_name, product.pack_size, product.category_name]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {product.gtin && (
              <p className="mt-1 font-technical text-xs text-muted">Barcode {product.gtin}</p>
            )}
            {product.requires_batch && (
              <Badge tone="info" className="mt-2">
                Batch &amp; expiry tracked
              </Badge>
            )}

            {offers.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-2xl font-bold text-ink">
                  {formatMoney(cheapest, best.currency)}
                </p>
                {dearest !== null && cheapest !== null && dearest > cheapest && (
                  <p className="text-sm text-muted">
                    up to {formatMoney(dearest, best.currency)} elsewhere &mdash;{' '}
                    <span className="font-medium text-accent-strong">
                      save {formatMoney(dearest - cheapest, best.currency)}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {user && (
            <form action={toggleFavouriteProductAction}>
              <input type="hidden" name="productId" value={product.id} />
              <button
                type="submit"
                className="rounded-brand border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={isFavourite ? 'star-filled' : 'star'} size={15} />
                  {isFavourite ? 'Saved' : 'Save'}
                </span>
              </button>
            </form>
          )}
        </Card>

        <section>
          <SectionHeading
            title={`${offers.length} ${offers.length === 1 ? 'seller has' : 'sellers have'} this in stock`}
            subtitle={`Within 40 km of ${location.label}, ranked by availability, distance, price, rating and delivery time`}
          />

          {offers.length ? (
            <div className="space-y-3">
              {offers.map((offer, index) => (
                <OfferCard key={offer.inventory_item_id} offer={offer} rank={index + 1} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="inbox"
              title="No nearby seller has this right now"
              body="Every listing shown on AfriMesh is stock a verified seller physically has. Rather than show you something you cannot buy, we are telling you plainly. Try a wider search area."
            />
          )}
        </section>

        {product.description && (
          <section>
            <SectionHeading title="About this product" />
            <Card>
              <p className="text-sm text-muted">{product.description}</p>
            </Card>
          </section>
        )}
      </div>
    </ConsumerShell>
  )
}
