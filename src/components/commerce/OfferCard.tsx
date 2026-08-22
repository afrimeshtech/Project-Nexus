import Link from 'next/link'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { Icon } from '@/components/Icon'
import { Badge, Rating, ScoreBar } from '@/components/ui'
import { AddToCart } from '@/components/commerce/AddToCart'
import { formatMoney } from '@/lib/money'
import { formatDistance, formatEta } from '@/lib/geo'
import type { Offer } from '@/modules/recommendation/service'
import type { ProductResult } from '@/modules/search/service'

/**
 * A single seller's offer. This is the unit of the price-comparison view: the
 * same product from different nearby shops, each showing what actually decides
 * the purchase - price, distance, arrival time, stock and reputation.
 */
export function OfferCard({
  offer,
  rank,
  mode = 'consumer',
  showScore = true,
  lead = 'seller',
  index = 0,
}: {
  offer: Offer
  rank?: number
  mode?: 'consumer' | 'sourcing'
  showScore?: boolean
  /** Position in the list, for the staggered arrival. */
  index?: number
  /**
   * Which image leads the card. Comparing sellers for one product, you need to
   * tell the shops apart, so the logo leads. Browsing one shop's shelves, every
   * card would carry the same logo, so the product leads instead.
   */
  lead?: 'seller' | 'product'
}) {
  const low = offer.qty_available <= 5
  const leadsWithProduct = lead === 'product'

  return (
    <article
      className="group card card-interactive rise-in relative flex flex-col gap-3 overflow-hidden p-4 hover:card-interactive-hover sm:flex-row sm:items-center"
      style={{ animationDelay: `${Math.min(index, 9) * 80}ms` }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {rank !== undefined && (
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
              rank === 1
                ? 'bg-accent-500 text-accent-ink shadow-[0_0_0_3px_var(--color-accent-glow)]'
                : 'bg-surface-muted text-muted'
            }`}
          >
            {rank}
          </span>
        )}
        {leadsWithProduct ? (
          <ProductThumb
            name={offer.product_name}
            imageUrl={offer.image_url}
            brandLogo={offer.brand_logo}
            categorySlug={offer.category_slug}
            size="md"
          />
        ) : (
          <SellerThumb
            name={offer.seller_name}
            logoUrl={offer.seller_logo}
            type={offer.seller_type}
            size="md"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {leadsWithProduct ? (
              <Link
                href={`/product/${offer.product_id}`}
                className="truncate font-semibold text-ink hover:text-accent-400"
              >
                {offer.product_name}
              </Link>
            ) : (
              <Link
                href={`/shop/${offer.seller_slug}`}
                className="truncate font-semibold text-ink hover:text-accent-400"
              >
                {offer.seller_name}
              </Link>
            )}
            {rank === 1 && <Badge tone="brand">Best match</Badge>}
            {offer.on_promo && <Badge tone="sand">Promo</Badge>}
            {offer.prior_orders > 0 && <Badge tone="neutral">You&rsquo;ve shopped here</Badge>}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="pin" size={13} />
              {formatDistance(offer.distance_km)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="scooter" size={13} />
              {formatEta(offer.eta_minutes)}
            </span>
            <Rating value={offer.rating} count={offer.rating_count} />
            <span className={low ? 'font-medium text-warning-ink' : ''}>
              {low ? `Only ${offer.qty_available} left` : `${offer.qty_available} in stock`}
            </span>
          </div>

          {showScore && (
            <div className="mt-2 max-w-xs">
              <ScoreBar score={offer.score} breakdown={offer.score_breakdown} />
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-end justify-between gap-3 sm:flex-col sm:items-end">
        <div className="text-right">
          <p className="text-lg font-bold text-ink">
            <span className="price-tag group-hover:price-tag-glow">
              {formatMoney(offer.unit_price, offer.currency)}
            </span>
          </p>
          <p className="text-xs text-muted">
            per {offer.pack_size ? offer.pack_size : offer.unit_of_measure}
          </p>
        </div>
        <div className="w-36">
          <AddToCart
            inventoryItemId={offer.inventory_item_id}
            minOrderQty={offer.min_order_qty}
            maxQty={offer.qty_available}
            mode={mode}
            compact
          />
        </div>
      </div>
    </article>
  )
}

/**
 * A product summarised across every nearby seller. Leads with the cheapest
 * price and how many shops have it, because that is the comparison the BRS
 * says consumers currently cannot make.
 */
export function ProductResultCard({
  result,
  index = 0,
}: {
  result: ProductResult
  index?: number
}) {
  const spread = result.highest_price - result.best_price

  return (
    <Link
      href={`/product/${result.top_offer.product_id}`}
      className="group product-card card-interactive press rise-in flex gap-4 p-4 hover:card-interactive-hover hover:product-card-hover active:press-active"
      // Staggered arrival, capped at the tenth card: past about 600ms the last
      // card in a long grid is still fading in while the reader is already
      // scrolling, which reads as lag rather than polish.
      style={{ animationDelay: `${Math.min(index, 9) * 80}ms` }}
    >
      <ProductThumb
        name={result.product_name}
        imageUrl={result.image_url}
        brandLogo={result.brand_logo}
        categorySlug={result.category_slug}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink transition-colors group-hover:text-accent-500">
          {result.product_name}
        </p>
        <p className="truncate text-xs text-muted">
          {[result.brand_name, result.pack_size].filter(Boolean).join(' · ') ||
            result.unit_of_measure}
        </p>

        <p className="mt-1.5 text-base font-bold text-ink">
          <span className="price-tag group-hover:price-tag-glow">
            from {formatMoney(result.best_price, result.currency)}
          </span>
        </p>

        {/* Shop count and distance are the two things that make a nearby
            listing worth tapping, so they carry the accent rather than sitting
            in the same grey as the pack size. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-accent-500">
          <span className="accent-attention">
            {result.seller_count} {result.seller_count === 1 ? 'shop' : 'shops'} nearby
          </span>
          <span aria-hidden>·</span>
          <span>{formatDistance(result.nearest_km)} away</span>
          <span aria-hidden>·</span>
          <span>{formatEta(result.fastest_eta)}</span>
        </div>

        {spread > 0 && (
          <p className="mt-1 text-xs text-accent-500">
            Save up to {formatMoney(spread, result.currency)} by comparing
          </p>
        )}
      </div>
    </Link>
  )
}
