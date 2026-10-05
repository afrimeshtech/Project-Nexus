import { getSql } from '@/db/client'
import { distanceKmSql } from '@/lib/geo'
import { RANKING_LAUNCHED } from '@/lib/launch-ranking'
import { priceColumnFor, rankingScopeFor, supplierTypeFor, tierOf } from '@/lib/tiers'

/**
 * MODULE: recommendation
 *
 * "The recommendation engine is the platform's strategic differentiator."
 * - System Architecture Document
 *
 * It answers the single question the CTO inventory note says the platform must
 * answer exceptionally well:
 *
 *   "Who nearest to the buyer has the required product available right now, at
 *    the best price, and can fulfil the order reliably?"
 *
 * Three ranking models, one per buying tier (consumer / outlet / merchant),
 * each a weighted sum of normalised factors. The weights live in the
 * `ranking_weights` table because the SAD requires them to be "configurable
 * without changing application code" - an operations lead can retune the
 * marketplace from the admin console with no deploy.
 *
 * Ranking runs in PostgreSQL rather than in the application: the candidate set
 * for a popular product in a dense city is large, and pulling it into Node to
 * sort would blow the PRD's 2-second search budget.
 */

export type RankingScope = 'consumer' | 'outlet' | 'merchant'

/**
 * Default weights, from the SAD's Consumer Ranking table. These are seeded
 * into `ranking_weights` and are only a fallback if the table is empty.
 */
export const DEFAULT_WEIGHTS: Record<RankingScope, Record<string, number>> = {
  // SAD, Recommendation Engine -> Consumer Ranking
  consumer: {
    availability: 30,
    distance: 25,
    price: 15,
    rating: 10,
    delivery_time: 10,
    trust: 5,
    purchase_history: 5,
  },
  // SAD -> Outlet Ranking: wholesale availability, merchant distance,
  // wholesale pricing, fulfilment reliability, merchant rating
  outlet: {
    availability: 30,
    distance: 20,
    price: 25,
    rating: 5,
    delivery_time: 5,
    trust: 5,
    fulfilment: 10,
  },
  // SAD -> Merchant Ranking: warehouse proximity, inventory depth, dispatch
  // reliability, historical fulfilment, bulk pricing
  merchant: {
    availability: 30,
    distance: 20,
    price: 20,
    rating: 5,
    delivery_time: 10,
    trust: 5,
    fulfilment: 10,
  },
}

export async function getWeights(scope: RankingScope): Promise<Record<string, number>> {
  const sql = await getSql()
  const rows = await sql.query<{ factor: string; weight: number }>(
    `SELECT factor, weight FROM ranking_weights WHERE scope = $1`,
    [scope],
  )
  if (!rows.length) return DEFAULT_WEIGHTS[scope]
  return Object.fromEntries(rows.map((r) => [r.factor, Number(r.weight)]))
}

export async function setWeight(
  scope: RankingScope,
  factor: string,
  weight: number,
): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `INSERT INTO ranking_weights (scope, factor, weight) VALUES ($1,$2,$3)
     ON CONFLICT (scope, factor) DO UPDATE SET weight = EXCLUDED.weight, updated_at = now()`,
    [scope, factor, weight],
  )
}

// ---------------------------------------------------------------------------

export interface BuyerContext {
  /** Buyer position. Everything is ranked relative to this point. */
  lat: number
  lng: number
  /** 5 = consumer, 4 = outlet, 3 = merchant, 2 = warehouse. */
  tier: number
  userId?: string | null
}

export interface OfferFilters {
  maxDistanceKm?: number
  maxPrice?: number
  minRating?: number
  maxEtaMinutes?: number
  categoryId?: string
  inStockOnly?: boolean
  limit?: number
}

export interface Offer {
  inventory_item_id: string
  product_id: string
  organisation_id: string
  product_name: string
  image_url: string | null
  gtin: string | null
  unit_of_measure: string
  pack_size: string | null
  brand_name: string | null
  /** Logo of the company that makes it; the fallback when there is no photo. */
  brand_logo: string | null
  category_name: string | null
  /** Slug, not the display name: the product artwork is keyed on it. */
  category_slug: string | null

  seller_name: string
  seller_type: string
  seller_slug: string
  seller_logo: string | null
  seller_city: string | null
  seller_address: string | null

  unit_price: number
  on_promo: boolean
  currency: string
  min_order_qty: number
  qty_available: number

  distance_km: number
  eta_minutes: number
  rating: number
  rating_count: number
  trust_score: number
  fulfilment_rate: number
  prior_orders: number

  /** 0-100. The weighted recommendation score. */
  score: number
  /** Per-factor contribution, so the UI can explain *why* something ranked. */
  score_breakdown: Record<string, number>
}

/**
 * Normalisation notes - every factor is mapped to 0..1 before weighting:
 *
 *  availability  depth of stock, saturating at 10 units. A shop with 40 units
 *                is not 4x better than one with 10; it is just "in stock".
 *  distance      linear decay to the search radius.
 *  price         cheapest offer for that product scores 1, others scale down
 *                by ratio. Ratio rather than range so a single outlier
 *                listing cannot flatten everyone else's score.
 *  rating        stars / 5, damped while an outlet has few reviews so a
 *                single 5-star rating does not outrank an established shop.
 *  delivery_time ETA decaying over a 3-hour horizon.
 *  trust         platform trust score / 100.
 *  fulfilment    historical fulfilment rate (B2B models only).
 *  purchase_history  repeat relationships, saturating at 3 prior orders.
 */
function buildScoreSql(weights: Record<string, number>): { expr: string; parts: string[] } {
  const w = (k: string) => Number(weights[k] ?? 0)
  const total = Object.values(weights).reduce((a, b) => a + Number(b), 0) || 1

  const factors: Record<string, string> = {
    availability: `LEAST(qty_available::numeric / 10.0, 1.0)`,
    distance: `GREATEST(0, 1 - (distance_km / NULLIF(radius_km, 0)))`,
    price: `CASE WHEN unit_price > 0 THEN LEAST(best_price::numeric / unit_price, 1.0) ELSE 0 END`,
    rating: `(rating / 5.0) * LEAST(rating_count::numeric / 5.0, 1.0)`,
    delivery_time: `GREATEST(0, 1 - (eta_minutes::numeric / 180.0))`,
    trust: `(trust_score / 100.0)`,
    fulfilment: `(fulfilment_rate / 100.0)`,
    purchase_history: `LEAST(prior_orders::numeric / 3.0, 1.0)`,
  }

  const terms: string[] = []
  const parts: string[] = []
  for (const [factor, expr] of Object.entries(factors)) {
    const weight = w(factor)
    if (!weight) continue
    terms.push(`(${expr}) * ${weight}`)
    // Each factor's own contribution, exposed for the "why this shop?" UI.
    parts.push(`ROUND(((${expr}) * ${weight} / ${total} * 100)::numeric, 1) AS score_${factor}`)
  }

  const expr = terms.length
    ? `ROUND(((${terms.join(' + ')}) / ${total} * 100)::numeric, 2)`
    : `0::numeric`

  return { expr, parts }
}

/**
 * Rank every live offer that a buyer at this tier is allowed to purchase.
 *
 * Business rules are enforced in the WHERE clause, not in the caller:
 * `o.tier_level = buyerTier - 1` is exactly "consumers cannot purchase
 * directly from warehouses; retailers purchase from merchants; merchants
 * purchase from warehouses" (PRD §12).
 */
export async function rankOffers(
  ctx: BuyerContext,
  target: { productId?: string; query?: string; sellerOrgId?: string },
  filters: OfferFilters = {},
): Promise<Offer[]> {
  const sql = await getSql()
  const scope = rankingScopeFor(ctx.tier)
  const weights = await getWeights(scope)
  const { expr, parts } = buildScoreSql(weights)

  const supplierType = supplierTypeFor(ctx.tier)
  if (!supplierType) return []
  const sellerTier = tierOf(supplierType)
  const priceCol = priceColumnFor(ctx.tier)
  const radius = filters.maxDistanceKm ?? 25
  const limit = filters.limit ?? 40

  const params: unknown[] = [ctx.lat, ctx.lng, sellerTier, radius, ctx.userId ?? null]
  const P = { lat: '$1', lng: '$2' }
  const conditions: string[] = [
    `i.is_listed = TRUE`,
    `i.${priceCol} IS NOT NULL`,
    `o.tier_level = $3`,
    `o.status = 'active'`,
    `o.verification = 'verified'`,
  ]

  if (filters.inStockOnly !== false) conditions.push(`i.qty_available >= i.min_order_qty`)

  if (target.productId) {
    params.push(target.productId)
    conditions.push(`i.product_id = $${params.length}`)
  }
  if (target.sellerOrgId) {
    params.push(target.sellerOrgId)
    conditions.push(`i.organisation_id = $${params.length}`)
  }
  if (target.query) {
    params.push(target.query.trim())
    const q = `$${params.length}`
    // Barcode first (exact), then full-text, then substring. Elasticsearch /
    // OpenSearch replaces this whole predicate in Phase 2 (SAD Search Engine);
    // PostgreSQL full-text keeps the MVP dependency-free and well inside the
    // PRD's 2-second budget at launch volumes.
    conditions.push(`(
      p.gtin = ${q}
      OR to_tsvector('simple', p.search_text) @@ plainto_tsquery('simple', ${q})
      OR p.search_text ILIKE '%' || ${q} || '%'
    )`)
  }
  if (filters.categoryId) {
    params.push(filters.categoryId)
    conditions.push(`p.category_id = $${params.length}`)
  }
  if (filters.maxPrice) {
    params.push(filters.maxPrice)
    conditions.push(`COALESCE(i.promo_price, i.${priceCol}) <= $${params.length}`)
  }
  if (filters.minRating) {
    params.push(filters.minRating)
    conditions.push(`o.rating >= $${params.length}`)
  }

  params.push(limit)
  const limitParam = `$${params.length}`

  const distance = distanceKmSql('i', P.lat, P.lng)

  const rows = await sql.query<Offer & Record<string, number>>(
    `
    WITH candidates AS (
      SELECT
        i.id                AS inventory_item_id,
        i.product_id,
        i.organisation_id,
        i.qty_available,
        i.min_order_qty,
        i.currency,
        COALESCE(i.promo_price, i.${priceCol})       AS unit_price,
        (i.promo_price IS NOT NULL)                  AS on_promo,
        ${distance}                                  AS distance_km,
        GREATEST(o.delivery_radius_km, $4)           AS radius_km,
        o.name          AS seller_name,
        o.type::text    AS seller_type,
        o.slug          AS seller_slug,
        o.logo_url      AS seller_logo,
        o.city          AS seller_city,
        o.address       AS seller_address,
        o.rating, o.rating_count, o.trust_score, o.fulfilment_rate,
        o.avg_dispatch_minutes,
        p.name          AS product_name,
        p.image_url,
        p.gtin,
        p.unit_of_measure,
        p.pack_size,
        b.name          AS brand_name,
        b.logo_url      AS brand_logo,
        c.name          AS category_name,
        c.slug          AS category_slug,
        COALESCE(h.prior_orders, 0) AS prior_orders
      FROM inventory_items i
      JOIN organisations o ON o.id = i.organisation_id
      JOIN products      p ON p.id = i.product_id AND p.status = 'active'
      LEFT JOIN brands     b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT seller_org_id, COUNT(*)::int AS prior_orders
          FROM orders
         WHERE buyer_user_id = $5 AND status IN ('delivered', 'completed')
         GROUP BY seller_org_id
      ) h ON h.seller_org_id = i.organisation_id
      WHERE ${conditions.join(' AND ')}
    ),
    bounded AS (
      SELECT *,
             (avg_dispatch_minutes + (distance_km / 18.0) * 60)::int AS eta_minutes
        FROM candidates
       WHERE distance_km <= radius_km
    ),
    normalised AS (
      SELECT *,
             MIN(unit_price) OVER (PARTITION BY product_id) AS best_price
        FROM bounded
       ${filters.maxEtaMinutes ? `WHERE eta_minutes <= ${Number(filters.maxEtaMinutes)}` : ''}
    )
    SELECT
      inventory_item_id, product_id, organisation_id, product_name, image_url, gtin,
      unit_of_measure, pack_size, brand_name, brand_logo, category_name, category_slug,
      seller_name, seller_type, seller_slug, seller_logo, seller_city, seller_address,
      unit_price, on_promo, currency, min_order_qty, qty_available,
      ROUND(distance_km::numeric, 2) AS distance_km,
      eta_minutes, rating, rating_count, trust_score, fulfilment_rate, prior_orders,
      ${expr} AS score
      ${parts.length ? ', ' + parts.join(', ') : ''}
    FROM normalised
    -- FUTURE-RANKING: unranked, the nearest shop comes first and price breaks ties.
    ORDER BY ${RANKING_LAUNCHED ? 'score DESC, distance_km ASC' : 'distance_km ASC, unit_price ASC'}
    LIMIT ${limitParam}
    `,
    params,
  )

  return rows.map((row) => {
    const breakdown: Record<string, number> = {}
    for (const key of Object.keys(row)) {
      if (key.startsWith('score_')) breakdown[key.slice(6)] = Number(row[key])
    }
    return { ...row, score: Number(row.score), score_breakdown: breakdown } as Offer
  })
}

/**
 * Nearby sellers a buyer may trade with, ranked by the same model but
 * aggregated to the organisation. Powers "Nearby Outlets" for consumers and
 * "Find Suppliers" for outlets and merchants.
 */
export async function rankSellers(
  ctx: BuyerContext,
  filters: { maxDistanceKm?: number; limit?: number; search?: string } = {},
) {
  const sql = await getSql()
  const supplierType = supplierTypeFor(ctx.tier)
  if (!supplierType) return []

  const radius = filters.maxDistanceKm ?? 25
  const params: unknown[] = [ctx.lat, ctx.lng, tierOf(supplierType), radius]
  let extra = ''
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`)
    extra = ` AND lower(o.name) LIKE $${params.length}`
  }
  params.push(filters.limit ?? 24)

  return sql.query<{
    id: string
    name: string
    slug: string
    type: string
    logo_url: string | null
    address: string | null
    city: string | null
    rating: number
    rating_count: number
    trust_score: number
    fulfilment_rate: number
    distance_km: number
    eta_minutes: number
    sku_count: number
    units_available: number
  }>(
    `SELECT o.id, o.name, o.slug, o.type::text AS type, o.logo_url, o.address, o.city,
            o.rating, o.rating_count, o.trust_score, o.fulfilment_rate,
            ROUND(${distanceKmSql('o', '$1', '$2')}::numeric, 2) AS distance_km,
            (o.avg_dispatch_minutes + (${distanceKmSql('o', '$1', '$2')} / 18.0) * 60)::int AS eta_minutes,
            COUNT(i.id) FILTER (WHERE i.is_listed AND i.qty_available > 0)::int AS sku_count,
            COALESCE(SUM(i.qty_available) FILTER (WHERE i.is_listed), 0)::int    AS units_available
       FROM organisations o
       LEFT JOIN inventory_items i ON i.organisation_id = o.id
      WHERE o.tier_level = $3
        AND o.status = 'active'
        AND o.verification = 'verified'
        AND ${distanceKmSql('o', '$1', '$2')} <= GREATEST(o.delivery_radius_km, $4)
        ${extra}
      GROUP BY o.id
      ORDER BY distance_km ASC
      LIMIT $${params.length}`,
    params,
  )
}
