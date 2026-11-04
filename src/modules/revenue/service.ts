import { getSql } from '@/db/client'
import { PLATFORM_IDS, PLATFORM_REVENUE } from '@/modules/wallet/service'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { ORG_LABEL, TIER, type OrgType } from '@/lib/tiers'

/**
 * MODULE: revenue
 *
 * What AfriMesh itself earns, kept apart from GMV. GMV is the value of goods
 * traded through the network; almost all of it belongs to sellers. Revenue is
 * the platform's own cut, and it is what the business model has to stand on.
 *
 * The streams that exist in code today:
 *   commission     orders.platform_fee - PLATFORM_FEE_BPS of the subtotal,
 *                  credited to the platform revenue wallet at payment
 *   delivery       a delivery fee less the rider's pay, when a delivery
 *                  partner carried the order (payRider)
 * and the costs paid out of revenue: cashback and points redemptions.
 *
 * Commission has three states, read from the order:
 *   pending        paid, not yet completed - the seller's share is still in
 *                  escrow and a cancellation would hand the fee back
 *   earned         completed - escrow released, nothing left to reverse it
 *   reversed       refunded - the refund debited the fee back out
 * Delivery margin counts as earned when the rider is paid: the service has
 * been rendered, and cancellation is only possible before delivery.
 *
 * Real money vs test money. Every payment records the gateway that took it,
 * and while PAYMENT_PROVIDER is "mock" that is every payment. An order is
 * real money only when a payment through a real gateway succeeded for it;
 * everything else - seeded demo orders, mock checkouts, wallet balances
 * topped up by mock - is test activity and must never be shown as earned
 * cash. Every figure here is computed for one side or the other, never both.
 *
 * Nothing is stored: each figure is derived from orders, deliveries and the
 * double-entry ledger on read, and reconcile() checks the two agree.
 */

export type MoneyMode = 'live' | 'test'

// Each order once, with whether it is real money and what its delivery earned
// the platform. Materialised so the per-period subqueries below reuse it.
const MONEY_CTE = `
  money AS MATERIALIZED (
    SELECT o.id, o.seller_org_id, o.seller_tier, o.status, o.payment_status,
           o.subtotal, o.total, o.platform_fee,
           o.placed_at, o.delivered_at, o.completed_at,
           EXISTS (
             SELECT 1 FROM payments p
              WHERE p.order_id = o.id
                AND p.status IN ('succeeded', 'refunded')
                AND p.provider <> 'mock'
           ) AS live,
           COALESCE((
             SELECT GREATEST(o.delivery_fee - d.rider_fee, 0) FROM deliveries d
              WHERE d.order_id = o.id AND d.status = 'delivered'
                AND d.rider_user_id IS NOT NULL
           ), 0) AS delivery_margin
      FROM orders o
  )`

export interface RevenueSummary {
  gmv: number
  paid_orders: number
  completed_orders: number
  earning_merchants: number
  commission_earned: number
  commission_pending: number
  commission_reversed: number
  delivery_margin: number
  /** commission_earned + delivery_margin */
  revenue_earned: number
}

const EMPTY: RevenueSummary = {
  gmv: 0,
  paid_orders: 0,
  completed_orders: 0,
  earning_merchants: 0,
  commission_earned: 0,
  commission_pending: 0,
  commission_reversed: 0,
  delivery_margin: 0,
  revenue_earned: 0,
}

export interface RevenueOverview {
  live: RevenueSummary
  test: RevenueSummary
  /** A real gateway has taken at least one successful payment, ever. */
  hasLivePayments: boolean
  /** The gateway new payments go through right now. */
  activeGateway: string
}

export async function revenueOverview(): Promise<RevenueOverview> {
  const sql = await getSql()
  const rows = await sql.query<RevenueSummary & { live: boolean }>(
    `WITH ${MONEY_CTE}
     SELECT live,
       COALESCE(SUM(total) FILTER (WHERE payment_status = 'succeeded'), 0)::bigint AS gmv,
       COUNT(*) FILTER (WHERE payment_status = 'succeeded')::int                   AS paid_orders,
       COUNT(*) FILTER (WHERE payment_status = 'succeeded' AND status = 'completed')::int
                                                                                     AS completed_orders,
       COUNT(DISTINCT seller_org_id)
         FILTER (WHERE payment_status = 'succeeded' AND status = 'completed')::int AS earning_merchants,
       COALESCE(SUM(platform_fee)
         FILTER (WHERE payment_status = 'succeeded' AND status = 'completed'), 0)::bigint
                                                                                     AS commission_earned,
       COALESCE(SUM(platform_fee)
         FILTER (WHERE payment_status = 'succeeded' AND status <> 'completed'), 0)::bigint
                                                                                     AS commission_pending,
       COALESCE(SUM(platform_fee) FILTER (WHERE payment_status = 'refunded'), 0)::bigint
                                                                                     AS commission_reversed,
       COALESCE(SUM(delivery_margin) FILTER (WHERE payment_status = 'succeeded'), 0)::bigint
                                                                                     AS delivery_margin
       FROM money GROUP BY live`,
  )
  // BIGINT sums arrive as strings from node-postgres; Number() them once here.
  const pick = (live: boolean): RevenueSummary => {
    const row = rows.find((r) => r.live === live)
    if (!row) return { ...EMPTY }
    const n = (v: unknown) => Number(v ?? 0)
    const commission_earned = n(row.commission_earned)
    const delivery_margin = n(row.delivery_margin)
    return {
      gmv: n(row.gmv),
      paid_orders: n(row.paid_orders),
      completed_orders: n(row.completed_orders),
      earning_merchants: n(row.earning_merchants),
      commission_earned,
      commission_pending: n(row.commission_pending),
      commission_reversed: n(row.commission_reversed),
      delivery_margin,
      revenue_earned: commission_earned + delivery_margin,
    }
  }

  const live = await sql.one<{ any: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM payments WHERE status = 'succeeded' AND provider <> 'mock') AS any`,
  )
  return {
    live: pick(true),
    test: pick(false),
    hasLivePayments: Boolean(live?.any),
    activeGateway: process.env.PAYMENT_PROVIDER ?? 'mock',
  }
}

/** Earned revenue per day - commission on completion, delivery margin on delivery. */
export async function revenueSeries(mode: MoneyMode, days = 30) {
  const sql = await getSql()
  return sql.query<{ day: string; revenue: number }>(
    `WITH ${MONEY_CTE},
     days AS (
       SELECT d::date AS day
         FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, interval '1 day') AS d
     )
     SELECT to_char(days.day, 'Mon DD') AS day,
       (COALESCE((SELECT SUM(m.platform_fee) FROM money m
                   WHERE m.live = $1 AND m.payment_status = 'succeeded'
                     AND m.status = 'completed' AND m.completed_at::date = days.day), 0)
      + COALESCE((SELECT SUM(m.delivery_margin) FROM money m
                   WHERE m.live = $1 AND m.payment_status = 'succeeded'
                     AND m.delivered_at::date = days.day), 0))::bigint AS revenue
       FROM days ORDER BY days.day`,
    [mode === 'live', days],
  )
}

/** Earned revenue per calendar week or month, most recent first. */
export async function revenueByPeriod(mode: MoneyMode, unit: 'week' | 'month', count: number) {
  const sql = await getSql()
  // `unit` is one of two literals, never input - safe to interpolate.
  const step = unit === 'week' ? '1 week' : '1 month'
  return sql.query<{ period: string; revenue: number; completed_orders: number }>(
    `WITH ${MONEY_CTE},
     periods AS (
       SELECT p::date AS start
         FROM generate_series(
           date_trunc('${unit}', CURRENT_DATE) - ($2::int - 1) * interval '${step}',
           date_trunc('${unit}', CURRENT_DATE),
           interval '${step}') AS p
     )
     SELECT ${
       unit === 'week'
         ? `'Week of ' || to_char(periods.start, 'DD Mon')`
         : `to_char(periods.start, 'Mon YYYY')`
     } AS period,
       (COALESCE((SELECT SUM(m.platform_fee) FROM money m
                   WHERE m.live = $1 AND m.payment_status = 'succeeded' AND m.status = 'completed'
                     AND date_trunc('${unit}', m.completed_at)::date = periods.start), 0)
      + COALESCE((SELECT SUM(m.delivery_margin) FROM money m
                   WHERE m.live = $1 AND m.payment_status = 'succeeded'
                     AND date_trunc('${unit}', m.delivered_at)::date = periods.start), 0))::bigint
         AS revenue,
       (SELECT COUNT(*) FROM money m
         WHERE m.live = $1 AND m.payment_status = 'succeeded' AND m.status = 'completed'
           AND date_trunc('${unit}', m.completed_at)::date = periods.start)::int AS completed_orders
       FROM periods ORDER BY periods.start DESC`,
    [mode === 'live', count],
  )
}

const TIER_LABEL: Record<number, string> = Object.fromEntries(
  (Object.entries(TIER) as [string, number][])
    .filter(([name]) => name !== 'consumer')
    .map(([name, tier]) => [tier, `${ORG_LABEL[name as OrgType]}s`]),
)

/** Earned commission by the tier of the business that made the sale. */
export async function revenueByTier(mode: MoneyMode) {
  const sql = await getSql()
  const rows = await sql.query<{ seller_tier: number; commission: number; orders: number }>(
    `WITH ${MONEY_CTE}
     SELECT seller_tier, COALESCE(SUM(platform_fee), 0)::bigint AS commission, COUNT(*)::int AS orders
       FROM money
      WHERE live = $1 AND payment_status = 'succeeded' AND status = 'completed'
      GROUP BY seller_tier ORDER BY commission DESC`,
    [mode === 'live'],
  )
  return rows.map((r) => ({
    ...r,
    label: TIER_LABEL[r.seller_tier] ?? `Tier ${r.seller_tier}`,
  }))
}

/**
 * Earned commission by product category. The fee is charged on the order
 * subtotal, so each line carries its share of it in proportion to its value.
 */
export async function revenueByCategory(mode: MoneyMode, limit = 8) {
  const sql = await getSql()
  return sql.query<{ category: string; commission: number; units: number }>(
    `WITH ${MONEY_CTE}
     SELECT COALESCE(c.name, 'Uncategorised') AS category,
            ROUND(SUM(oi.line_total::numeric * m.platform_fee / NULLIF(m.subtotal, 0)))::bigint
              AS commission,
            SUM(oi.qty)::int AS units
       FROM money m
       JOIN order_items oi ON oi.order_id = m.id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE m.live = $1 AND m.payment_status = 'succeeded' AND m.status = 'completed'
      GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT $2`,
    [mode === 'live', limit],
  )
}

export interface Reconciliation {
  /** The platform revenue wallet's balance, from the ledger. */
  ledgerBalance: number
  /** What the orders say it should be: commission held + delivery margin - rewards paid. */
  expected: number
  difference: number
  /** Cashback and points redemptions, both paid out of revenue. */
  rewardsPaid: number
}

/**
 * Checks the order-level figures above against the double-entry ledger. The
 * revenue wallet is credited the fee at payment, debited it on a refund,
 * credited a rider's margin, and debited cashback and point redemptions - so
 * its balance must equal those same movements read off the orders. Any
 * difference is money the reports cannot account for.
 */
export async function reconcile(): Promise<Reconciliation> {
  const sql = await getSql()
  const row = await sql.one<{ ledger: number; held: number; margin: number; rewards: number }>(
    `WITH ${MONEY_CTE},
     revenue_wallet AS (
       SELECT id, available FROM wallets
        WHERE owner_type = 'platform' AND owner_id = $1 AND currency = $2
     )
     SELECT
       COALESCE((SELECT available FROM revenue_wallet), 0)::bigint AS ledger,
       COALESCE((SELECT SUM(platform_fee) FROM money WHERE payment_status = 'succeeded'), 0)::bigint
         AS held,
       COALESCE((SELECT SUM(delivery_margin) FROM money WHERE payment_status = 'succeeded'), 0)::bigint
         AS margin,
       COALESCE((
         SELECT SUM(e.amount) FROM ledger_entries e
           JOIN ledger_transactions t ON t.id = e.transaction_id
          WHERE e.wallet_id = (SELECT id FROM revenue_wallet)
            AND e.direction = 'debit'
            AND t.type IN ('cashback', 'points_redemption')
       ), 0)::bigint AS rewards`,
    [PLATFORM_IDS[PLATFORM_REVENUE], DEFAULT_CURRENCY],
  )
  const ledgerBalance = Number(row?.ledger ?? 0)
  const rewardsPaid = Number(row?.rewards ?? 0)
  const expected = Number(row?.held ?? 0) + Number(row?.margin ?? 0) - rewardsPaid
  return { ledgerBalance, expected, difference: ledgerBalance - expected, rewardsPaid }
}

/**
 * Money the platform holds that belongs to sellers: sale proceeds still in
 * escrow, and balances they can withdraw. A liability, not income - it is
 * what turns "cash collected" into something other than revenue.
 */
export async function heldForMerchants() {
  const sql = await getSql()
  const row = await sql.one<{ escrow: number; available: number; businesses: number }>(
    `SELECT COALESCE(SUM(locked), 0)::bigint AS escrow,
            COALESCE(SUM(available), 0)::bigint AS available,
            COUNT(*) FILTER (WHERE locked > 0 OR available > 0)::int AS businesses
       FROM wallets WHERE owner_type = 'organisation' AND currency = $1`,
    [DEFAULT_CURRENCY],
  )
  return {
    escrow: Number(row?.escrow ?? 0),
    available: Number(row?.available ?? 0),
    businesses: Number(row?.businesses ?? 0),
  }
}
