import Link from 'next/link'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { Icon } from '@/components/Icon'
import { Badge, ItemCard, Rating, ScoreBar, StatusPill, stockState } from '@/components/ui'
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
  cartQty = 0,
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
  /**
   * This exact inventory item's quantity already in the basket, if any.
   * Product-leading cards only — a seller-leading card's thumb is the shop's
   * mark, not the product's, so a quantity control has nothing to overlap.
   */
  cartQty?: number
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
          <div className="relative shrink-0">
            <ProductThumb
              name={offer.product_name}
              imageUrl={offer.image_url}
              brandLogo={offer.brand_logo}
              categorySlug={offer.category_slug}
              size="lg"
            />
            {/* Same corner `pill-status` already uses over an ItemCard's well —
                one occupant: a confirmed basket line outranks a low-stock
                warning, since the shopper already acted on it. */}
            {cartQty > 0 ? (
              <StatusPill state="in">
                <Icon name="check" size={11} />
                In basket
              </StatusPill>
            ) : (
              low && <StatusPill state={stockState(offer.qty_available)} />
            )}
            <div className="absolute -bottom-2.5 -right-3.5">
              <AddToCart
                inventoryItemId={offer.inventory_item_id}
                minOrderQty={offer.min_order_qty}
                maxQty={offer.qty_available}
                mode={mode}
                overlay
                cartQty={cartQty}
              />
            </div>
          </div>
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
                className="truncate font-semibold text-ink hover:text-accent-strong"
              >
                {offer.product_name}
              </Link>
            ) : (
              <Link
                href={`/shop/${offer.seller_slug}`}
                className="truncate font-semibold text-ink hover:text-accent-strong"
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
        {/* Product-leading cards already carry the add control as the stepper
            overlapping the thumb above — a second one here would be the two
            competing controls the redesign was written to avoid. */}
        {!leadsWithProduct && (
          <div className="w-36">
            <AddToCart
              inventoryItemId={offer.inventory_item_id}
              minOrderQty={offer.min_order_qty}
              maxQty={offer.qty_available}
              mode={mode}
              compact
            />
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * A product summarised across every nearby seller. Leads with the cheapest
 * price and how many shops have it, because that is the comparison the BRS
 * says consumers currently cannot make.
 *
 * Same anatomy as the partner's inventory card — photo well, name, label/value
 * rows, one way in — so a grid of results is scanned by position rather than
 * re-read card by card. The three rows are the three questions a shopper is
 * actually asking: what does it cost, who near me has it, how far is that.
 */
export function ProductResultCard({ result }: { result: ProductResult }) {
  const spread = result.highest_price - result.best_price

  return (
    <ItemCard
      name={result.product_name}
      href={`/product/${result.top_offer.product_id}`}
      identifier={
        [result.brand_name, result.pack_size].filter(Boolean).join(' · ') ||
        result.unit_of_measure ||
        undefined
      }
      media={
        <ProductThumb
          name={result.product_name}
          imageUrl={result.image_url}
          brandLogo={result.brand_logo}
          categorySlug={result.category_slug}
          size="xl"
        />
      }
      rows={[
        {
          label: 'From',
          value: (
            <span className="text-accent-strong">
              {formatMoney(result.best_price, result.currency)}
            </span>
          ),
        },
        {
          label: 'Shops nearby',
          value: result.seller_count,
        },
        {
          label: 'Nearest',
          value: `${formatDistance(result.nearest_km)} · ${formatEta(result.fastest_eta)}`,
        },
      ]}
      footer={
        spread > 0 ? (
          <p className="mt-2.5 text-xs text-muted">
            Save up to{' '}
            <span className="font-semibold text-accent-strong">
              {formatMoney(spread, result.currency)}
            </span>{' '}
            by comparing
          </p>
        ) : undefined
      }
      action={`Compare ${result.seller_count} ${result.seller_count === 1 ? 'shop' : 'shops'}`}
    />
  )
}
