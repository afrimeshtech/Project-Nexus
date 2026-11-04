import { getSql } from '@/db/client'

/**
 * MODULE: analytics
 *
 * The KPIs the BRS and PRD commit to measuring. Every figure here is derived
 * from transactional tables and the event log - nothing is hand-maintained, so
 * a dashboard cannot drift from reality.
 *
 * PRD §14 Success Metrics + BRS Success Metrics:
 *   platform  DAU/MAU, active outlets & merchants, GMV, AOV, payment success
 *             rate, average response time, transaction volume
 *   seller    order fulfilment rate, inventory turnover, delivery reliability
 *   consumer  search success rate, time to locate products, repeat purchase rate
 */

export interface PlatformKpis {
  mau: number
  dau: number
  consumers: number
  active_outlets: number
  active_merchants: number
  active_warehouses: number
  pending_verifications: number
  gmv: number
  aov: number
  /** Orders on the same basis as GMV and AOV: paid, and not since refunded. */
  paid_orders: number
  /** Placed but never paid - abandoned at checkout, or cancelled before paying. */
  unpaid_orders: number
  orders_total: number
  orders_30d: number
  payment_success_rate: number
  fulfilment_rate: number
  avg_search_ms: number
  search_success_rate: number
  listed_skus: number
  units_available: number
  stock_out_rate: number
}

export async function platformKpis(): Promise<PlatformKpis> {
  const sql = await getSql()
  const row = await sql.one<PlatformKpis>(
    `SELECT
      (SELECT COUNT(*)::int FROM users WHERE last_login_at > now() - interval '30 days') AS mau,
      (SELECT COUNT(*)::int FROM users WHERE last_login_at > now() - interval '1 day')   AS dau,
      (SELECT COUNT(*)::int FROM users WHERE role = 'consumer')                          AS consumers,
      (SELECT COUNT(*)::int FROM organisations WHERE type='outlet'    AND status='active') AS active_outlets,
      (SELECT COUNT(*)::int FROM organisations WHERE type='merchant'  AND status='active') AS active_merchants,
      (SELECT COUNT(*)::int FROM organisations WHERE type='warehouse' AND status='active') AS active_warehouses,
      (SELECT COUNT(*)::int FROM organisations WHERE verification='pending')               AS pending_verifications,

      -- GMV counts money that actually changed hands. A refund sets
      -- payment_status to 'refunded', so refunded orders drop out; an order
      -- that was never paid never reaches 'succeeded'. GMV, AOV and
      -- paid_orders share this one basis, so GMV / paid_orders = AOV. The
      -- dashboard once showed AOV beside a count of *all* orders, and the
      -- three figures could not be reconciled (25 paid vs 28 placed).
      (SELECT COALESCE(SUM(total),0)::bigint FROM orders
        WHERE payment_status = 'succeeded')                                              AS gmv,
      (SELECT COALESCE(ROUND(AVG(total)),0)::bigint FROM orders
        WHERE payment_status = 'succeeded')                                              AS aov,
      (SELECT COUNT(*)::int FROM orders WHERE payment_status = 'succeeded')              AS paid_orders,
      (SELECT COUNT(*)::int FROM orders
        WHERE payment_status IN ('pending', 'failed'))                                   AS unpaid_orders,
      (SELECT COUNT(*)::int FROM orders)                                                 AS orders_total,
      (SELECT COUNT(*)::int FROM orders WHERE placed_at > now() - interval '30 days')     AS orders_30d,

      (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE status='succeeded')
                             / NULLIF(COUNT(*),0), 1), 100)::numeric
         FROM payments)                                                                  AS payment_success_rate,
      (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('delivered','completed'))
                             / NULLIF(COUNT(*) FILTER (WHERE status <> 'pending_payment'),0), 1), 100)::numeric
         FROM orders)                                                                    AS fulfilment_rate,

      (SELECT COALESCE(ROUND(AVG(took_ms)),0)::int FROM search_queries)                  AS avg_search_ms,
      -- Search success = share of searches that returned at least one buyable
      -- offer. The PRD tracks this as "product search success rate".
      (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE results_count > 0)
                             / NULLIF(COUNT(*),0), 1), 0)::numeric
         FROM search_queries)                                                            AS search_success_rate,

      (SELECT COUNT(*)::int FROM inventory_items WHERE is_listed)                        AS listed_skus,
      (SELECT COALESCE(SUM(qty_available),0)::int FROM inventory_items)                  AS units_available,
      (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE qty_available = 0)
                             / NULLIF(COUNT(*),0), 1), 0)::numeric
         FROM inventory_items WHERE is_listed)                                           AS stock_out_rate
    `,
  )
  return row!
}

/** GMV and paid-order count per day - the platform trend chart, on GMV's basis. */
export async function gmvSeries(days = 14) {
  const sql = await getSql()
  return sql.query<{ day: string; gmv: number; orders: number }>(
    `SELECT to_char(d.day, 'Mon DD') AS day,
            COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'succeeded'), 0)::bigint AS gmv,
            COUNT(o.id) FILTER (WHERE o.payment_status = 'succeeded')::int AS orders
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day') AS d(day)
       LEFT JOIN orders o ON o.placed_at::date = d.day::date
      GROUP BY d.day
      ORDER BY d.day`,
    [days],
  )
}

// ---------------------------------------------------------------------------
// Seller-side
// ---------------------------------------------------------------------------

export interface SellerKpis {
  orders_total: number
  orders_open: number
  orders_30d: number
  revenue: number
  revenue_30d: number
  aov: number
  fulfilment_rate: number
  avg_dispatch_minutes: number
  units_sold: number
  inventory_turnover: number
  rating: number
  rating_count: number
}

export async function sellerKpis(orgId: string): Promise<SellerKpis> {
  const sql = await getSql()
  const row = await sql.one<SellerKpis>(
    `SELECT
      (SELECT COUNT(*)::int FROM orders WHERE seller_org_id = $1)                        AS orders_total,
      (SELECT COUNT(*)::int FROM orders WHERE seller_org_id = $1
         AND status IN ('confirmed','preparing','dispatched'))                           AS orders_open,
      (SELECT COUNT(*)::int FROM orders WHERE seller_org_id = $1
         AND placed_at > now() - interval '30 days')                                     AS orders_30d,
      (SELECT COALESCE(SUM(total - platform_fee),0)::bigint FROM orders
        WHERE seller_org_id = $1 AND payment_status = 'succeeded')                       AS revenue,
      (SELECT COALESCE(SUM(total - platform_fee),0)::bigint FROM orders
        WHERE seller_org_id = $1 AND payment_status = 'succeeded'
          AND placed_at > now() - interval '30 days')                                    AS revenue_30d,
      (SELECT COALESCE(ROUND(AVG(total)),0)::bigint FROM orders
        WHERE seller_org_id = $1 AND payment_status = 'succeeded')                       AS aov,
      (SELECT fulfilment_rate FROM organisations WHERE id = $1)                          AS fulfilment_rate,
      (SELECT avg_dispatch_minutes FROM organisations WHERE id = $1)                     AS avg_dispatch_minutes,
      (SELECT COALESCE(SUM(qty_sold),0)::int FROM inventory_items WHERE organisation_id = $1) AS units_sold,
      -- Inventory turnover: units sold relative to units still on the shelf.
      (SELECT COALESCE(ROUND((SUM(qty_sold)::numeric / NULLIF(SUM(qty_available),0)), 2), 0)
         FROM inventory_items WHERE organisation_id = $1)                                AS inventory_turnover,
      (SELECT rating FROM organisations WHERE id = $1)                                   AS rating,
      (SELECT rating_count FROM organisations WHERE id = $1)                             AS rating_count
    `,
    [orgId],
  )
  return row!
}

export async function sellerSalesSeries(orgId: string, days = 14) {
  const sql = await getSql()
  return sql.query<{ day: string; revenue: number; orders: number }>(
    `SELECT to_char(d.day, 'Mon DD') AS day,
            COALESCE(SUM(o.total - o.platform_fee) FILTER (WHERE o.payment_status='succeeded'), 0)::bigint AS revenue,
            COUNT(o.id)::int AS orders
       FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, interval '1 day') AS d(day)
       LEFT JOIN orders o ON o.placed_at::date = d.day::date AND o.seller_org_id = $1
      GROUP BY d.day ORDER BY d.day`,
    [orgId, days],
  )
}

export async function topSellingProducts(orgId: string, limit = 8) {
  const sql = await getSql()
  return sql.query<{ name: string; units: number; revenue: number }>(
    `SELECT oi.name_snapshot AS name,
            SUM(oi.qty)::int AS units,
            SUM(oi.line_total)::bigint AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.seller_org_id = $1 AND o.payment_status = 'succeeded'
      GROUP BY oi.name_snapshot
      ORDER BY revenue DESC
      LIMIT $2`,
    [orgId, limit],
  )
}

/**
 * Demand intelligence for a seller: what buyers near them searched for that
 * they do not stock. This is the "procurement planning" signal the inventory
 * doc §9 asks us to capture from day one.
 */
export async function unmetDemand(orgId: string, limit = 8) {
  const sql = await getSql()
  // Scoped to searches that happened within reach of this business - demand
  // 400 km away is not a restocking signal for a neighbourhood shop. Searches
  // with no recorded position are excluded rather than assumed to be local.
  return sql.query<{ query: string; hits: number }>(
    `SELECT s.query, COUNT(*)::int AS hits
       FROM search_queries s
       JOIN organisations o ON o.id = $1
      WHERE s.created_at > now() - interval '30 days'
        AND s.results_count = 0
        AND length(s.query) > 2
        AND s.lat IS NOT NULL AND s.lng IS NOT NULL
        AND (
          6371 * 2 * asin(sqrt(
            power(sin(radians(s.lat - o.lat) / 2), 2) +
            cos(radians(o.lat)) * cos(radians(s.lat)) *
            power(sin(radians(s.lng - o.lng) / 2), 2)
          ))
        ) <= GREATEST(o.delivery_radius_km, 25)
      GROUP BY s.query
      ORDER BY hits DESC
      LIMIT $2`,
    [orgId, limit],
  )
}

// ---------------------------------------------------------------------------
// Consumer-side
// ---------------------------------------------------------------------------

export async function consumerKpis(userId: string) {
  const sql = await getSql()
  const row = await sql.one<{
    orders: number
    spent: number
    saved_favourites: number
    repeat_sellers: number
    avg_distance: number
  }>(
    `SELECT
      (SELECT COUNT(*)::int FROM orders WHERE buyer_user_id = $1)                       AS orders,
      (SELECT COALESCE(SUM(total),0)::bigint FROM orders
        WHERE buyer_user_id = $1 AND payment_status='succeeded')                        AS spent,
      (SELECT COUNT(*)::int FROM favourites WHERE user_id = $1)                         AS saved_favourites,
      (SELECT COUNT(*)::int FROM (
         SELECT seller_org_id FROM orders WHERE buyer_user_id = $1
          GROUP BY seller_org_id HAVING COUNT(*) > 1) t)                                AS repeat_sellers,
      (SELECT COALESCE(ROUND(AVG(distance_km), 1), 0) FROM orders WHERE buyer_user_id = $1) AS avg_distance
    `,
    [userId],
  )
  return row!
}
