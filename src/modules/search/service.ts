import { getSql } from '@/db/client'
import {
  rankOffers,
  type BuyerContext,
  type Offer,
  type OfferFilters,
} from '@/modules/recommendation/service'
import { publish, EVENT } from '@/modules/events/service'

/**
 * MODULE: search
 *
 * Product discovery over *live nearby stock*. The SAD is explicit that
 * "search results prioritize nearby inventory before broader matches" - so
 * this module never returns a catalogue entry that nobody in range actually
 * has. A result you cannot buy is the exact waste the BRS complains about:
 * "Every unavailable product wastes time."
 *
 * Supported today: product name, brand, category, barcode/GTIN, fuzzy text,
 * and filters on distance, price, rating, availability and delivery speed.
 * Voice and image search are marked future in the PRD and are not built.
 */

export interface ProductResult {
  product_id: string
  product_name: string
  image_url: string | null
  brand_name: string | null
  /** Carried through so a product with no photo can still show its maker's mark. */
  brand_logo: string | null
  category_name: string | null
  category_slug: string | null
  pack_size: string | null
  unit_of_measure: string
  /** Cheapest live offer within range. */
  best_price: number
  highest_price: number
  currency: string
  /** How many distinct sellers in range have it - the price-comparison hook. */
  seller_count: number
  /** The top-ranked offer, i.e. what we would recommend buying. */
  top_offer: Offer
  nearest_km: number
  fastest_eta: number
}

export interface SearchOutcome {
  query: string
  results: ProductResult[]
  offers: Offer[]
  tookMs: number
}

/**
 * Search, then collapse offers to one row per product so the results page
 * reads as "Peak Milk 400g — from ₦2,400 — 6 shops nearby" rather than a flat
 * list of duplicate products.
 */
export async function searchProducts(
  ctx: BuyerContext,
  query: string,
  filters: OfferFilters = {},
): Promise<SearchOutcome> {
  const started = Date.now()
  const trimmed = query.trim()

  const offers = await rankOffers(ctx, trimmed ? { query: trimmed } : {}, {
    ...filters,
    limit: filters.limit ?? 120,
  })

  const grouped = new Map<string, ProductResult>()
  for (const offer of offers) {
    const existing = grouped.get(offer.product_id)
    if (!existing) {
      grouped.set(offer.product_id, {
        product_id: offer.product_id,
        product_name: offer.product_name,
        image_url: offer.image_url,
        brand_name: offer.brand_name,
        brand_logo: offer.brand_logo,
        category_name: offer.category_name,
        category_slug: offer.category_slug,
        pack_size: offer.pack_size,
        unit_of_measure: offer.unit_of_measure,
        best_price: offer.unit_price,
        highest_price: offer.unit_price,
        currency: offer.currency,
        seller_count: 1,
        top_offer: offer,
        nearest_km: offer.distance_km,
        fastest_eta: offer.eta_minutes,
      })
    } else {
      existing.seller_count += 1
      existing.best_price = Math.min(existing.best_price, offer.unit_price)
      existing.highest_price = Math.max(existing.highest_price, offer.unit_price)
      existing.nearest_km = Math.min(existing.nearest_km, offer.distance_km)
      existing.fastest_eta = Math.min(existing.fastest_eta, offer.eta_minutes)
      // offers arrive score-ordered, so the first one seen is the top offer.
    }
  }

  const results = [...grouped.values()]
  const tookMs = Date.now() - started

  // Demand intelligence (Inventory doc §9): search frequency is captured from
  // day one so Phase 3 forecasting has history to train on.
  if (trimmed) {
    void recordSearch(ctx, trimmed, results.length, tookMs)
  }

  return { query: trimmed, results, offers, tookMs }
}

async function recordSearch(ctx: BuyerContext, query: string, count: number, tookMs: number) {
  try {
    const sql = await getSql()
    await sql.query(
      `INSERT INTO search_queries (user_id, query, lat, lng, results_count, took_ms)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ctx.userId ?? null, query.toLowerCase(), ctx.lat, ctx.lng, count, tookMs],
    )
    await publish({
      type: EVENT.SearchPerformed,
      aggregateType: 'search',
      aggregateId: query.toLowerCase(),
      actorUserId: ctx.userId ?? null,
      payload: { resultsCount: count, tookMs },
    })
  } catch (err) {
    // Analytics must never break the shopping experience.
    console.error('[search] failed to record query', err)
  }
}

/** Type-ahead over the master catalogue. */
export async function autocomplete(prefix: string, limit = 8) {
  const term = prefix.trim().toLowerCase()
  if (term.length < 2) return []
  const sql = await getSql()
  return sql.query<{
    id: string
    name: string
    slug: string
    image_url: string | null
    category_name: string | null
  }>(
    `SELECT p.id, p.name, p.slug, p.image_url, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active' AND p.search_text LIKE $1
      ORDER BY (p.search_text LIKE $2) DESC, length(p.name) ASC
      LIMIT $3`,
    [`%${term}%`, `${term}%`, limit],
  )
}

/** All live offers for one product, ranked - the price-comparison view. */
export async function offersForProduct(
  ctx: BuyerContext,
  productId: string,
  filters: OfferFilters = {},
): Promise<Offer[]> {
  return rankOffers(ctx, { productId }, { ...filters, limit: filters.limit ?? 25 })
}

/** Everything a given seller has in stock, ranked - the shop page. */
export async function offersFromSeller(
  ctx: BuyerContext,
  sellerOrgId: string,
  filters: OfferFilters = {},
): Promise<Offer[]> {
  return rankOffers(ctx, { sellerOrgId }, { ...filters, limit: filters.limit ?? 60 })
}

/** Popular nearby products, from real demand signal rather than a curated list. */
export async function popularNearby(ctx: BuyerContext, limit = 8): Promise<ProductResult[]> {
  const { results } = await searchProducts(ctx, '', { limit: 90 })
  const sql = await getSql()

  const demand = await sql.query<{ product_id: string; hits: number }>(
    `SELECT product_id, COUNT(*)::int AS hits
       FROM product_views
      WHERE created_at > now() - interval '30 days'
      GROUP BY product_id`,
  )
  const hitMap = new Map(demand.map((d) => [d.product_id, d.hits]))

  return results
    .sort(
      (a, b) =>
        (hitMap.get(b.product_id) ?? 0) - (hitMap.get(a.product_id) ?? 0) ||
        b.seller_count - a.seller_count ||
        a.nearest_km - b.nearest_km,
    )
    .slice(0, limit)
}

export async function recordProductView(productId: string, userId?: string | null) {
  const sql = await getSql()
  await sql.query(`INSERT INTO product_views (product_id, user_id) VALUES ($1,$2)`, [
    productId,
    userId ?? null,
  ])
  await publish({
    type: EVENT.ProductViewed,
    aggregateType: 'product',
    aggregateId: productId,
    actorUserId: userId ?? null,
  })
}

/** Trending searches - shown as suggestion chips and used by the admin view. */
export async function trendingSearches(limit = 8) {
  const sql = await getSql()
  return sql.query<{ query: string; hits: number }>(
    `SELECT query, COUNT(*)::int AS hits
       FROM search_queries
      WHERE created_at > now() - interval '30 days' AND length(query) > 1
      GROUP BY query
      ORDER BY hits DESC
      LIMIT $1`,
    [limit],
  )
}

/**
 * One signed-in shopper's own recent searches, most recent distinct query
 * first. The homepage prefers this over `trendingSearches` once someone is
 * signed in - "what did I search for" is a more useful shortcut back into the
 * catalogue than "what is Ikeja searching for" once there is a real history
 * to draw on. No `hits` count: a personal history is ordered by recency, not
 * frequency, so there is nothing honest to put in that column.
 */
export async function recentSearches(userId: string, limit = 6) {
  const sql = await getSql()
  return sql.query<{ query: string }>(
    `SELECT query
       FROM search_queries
      WHERE user_id = $1 AND length(query) > 1
      GROUP BY query
      ORDER BY MAX(created_at) DESC
      LIMIT $2`,
    [userId, limit],
  )
}
