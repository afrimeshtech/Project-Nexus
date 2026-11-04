import { getSql, databaseDriver, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'

/**
 * MODULE: platform
 *
 * Administration: configuration, fraud monitoring and system health
 * (PRD Admin Module; SAD Security Architecture -> Fraud Prevention and
 * Monitoring & Observability).
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Pass `tx` when reading configuration from inside a transaction: a settings
 * lookup on a second connection while one is open is how a caller ends up
 * waiting on itself.
 */
export async function getSetting<T>(key: string, fallback: T, tx?: Sql): Promise<T> {
  const sql = tx ?? (await getSql())
  const row = await sql.one<{ value: T }>(`SELECT value FROM platform_settings WHERE key = $1`, [
    key,
  ])
  return row ? row.value : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `INSERT INTO platform_settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

// ---------------------------------------------------------------------------
// Fraud monitoring
// ---------------------------------------------------------------------------

export type FraudKind = 'velocity' | 'geo_anomaly' | 'high_value' | 'failed_payments' | 'oversell'

export interface FraudAlert {
  id: string
  user_id: string | null
  organisation_id: string | null
  order_id: string | null
  kind: FraudKind
  severity: 'low' | 'medium' | 'high'
  detail: string | null
  resolved: boolean
  created_at: Date
}

export async function raiseAlert(input: {
  kind: FraudKind
  severity?: 'low' | 'medium' | 'high'
  detail: string
  userId?: string | null
  organisationId?: string | null
  orderId?: string | null
}): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `INSERT INTO fraud_alerts (user_id, organisation_id, order_id, kind, severity, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.userId ?? null,
      input.organisationId ?? null,
      input.orderId ?? null,
      input.kind,
      input.severity ?? 'low',
      input.detail,
    ],
  )
  await publish({
    type: EVENT.FraudSignal,
    aggregateType: 'user',
    aggregateId: input.userId ?? 'system',
    payload: { kind: input.kind, severity: input.severity ?? 'low', detail: input.detail },
  })
}

/**
 * Risk sweep. The SAD lists risk scoring, transaction monitoring, geo-anomaly
 * detection and velocity checks; these are the rule-based versions. The ML
 * fraud model is a Phase 3 item and consumes the same event log.
 */
export async function runRiskSweep(): Promise<number> {
  const sql = await getSql()
  let raised = 0

  // Velocity: an unusual burst of orders from one account in a short window.
  const bursts = await sql.query<{ buyer_user_id: string; orders: number }>(
    `SELECT buyer_user_id, COUNT(*)::int AS orders
       FROM orders
      WHERE placed_at > now() - interval '1 hour'
      GROUP BY buyer_user_id
     HAVING COUNT(*) >= 6`,
  )
  for (const b of bursts) {
    const seen = await sql.one<{ id: string }>(
      `SELECT id FROM fraud_alerts
        WHERE user_id = $1 AND kind = 'velocity' AND created_at > now() - interval '1 hour'`,
      [b.buyer_user_id],
    )
    if (!seen) {
      await raiseAlert({
        kind: 'velocity',
        severity: 'medium',
        userId: b.buyer_user_id,
        detail: `${b.orders} orders placed in the last hour`,
      })
      raised++
    }
  }

  // Repeated declines: card testing, or a genuinely broken payment instrument.
  const declines = await sql.query<{ payer_user_id: string; fails: number }>(
    `SELECT payer_user_id, COUNT(*)::int AS fails
       FROM payments
      WHERE status = 'failed' AND created_at > now() - interval '1 hour'
      GROUP BY payer_user_id
     HAVING COUNT(*) >= 3`,
  )
  for (const d of declines) {
    const seen = await sql.one<{ id: string }>(
      `SELECT id FROM fraud_alerts
        WHERE user_id = $1 AND kind = 'failed_payments' AND created_at > now() - interval '1 hour'`,
      [d.payer_user_id],
    )
    if (!seen) {
      await raiseAlert({
        kind: 'failed_payments',
        severity: 'high',
        userId: d.payer_user_id,
        detail: `${d.fails} declined payments in the last hour`,
      })
      raised++
    }
  }

  // Geo-anomaly: a delivery point far outside the seller's declared radius.
  const anomalies = await sql.query<{ id: string; buyer_user_id: string; distance_km: number }>(
    `SELECT o.id, o.buyer_user_id, o.distance_km
       FROM orders o
       JOIN organisations s ON s.id = o.seller_org_id
      WHERE o.placed_at > now() - interval '24 hours'
        AND o.distance_km > s.delivery_radius_km * 3`,
  )
  for (const a of anomalies) {
    const seen = await sql.one<{ id: string }>(
      `SELECT id FROM fraud_alerts WHERE order_id = $1 AND kind = 'geo_anomaly'`,
      [a.id],
    )
    if (!seen) {
      await raiseAlert({
        kind: 'geo_anomaly',
        severity: 'low',
        userId: a.buyer_user_id,
        orderId: a.id,
        detail: `Delivery point ${a.distance_km} km away, well outside the seller's radius`,
      })
      raised++
    }
  }

  return raised
}

export async function listAlerts(
  includeResolved = false,
): Promise<(FraudAlert & { user_name: string | null; order_number: string | null })[]> {
  const sql = await getSql()
  return sql.query(
    `SELECT a.*, u.full_name AS user_name, o.order_number
       FROM fraud_alerts a
       LEFT JOIN users u  ON u.id = a.user_id
       LEFT JOIN orders o ON o.id = a.order_id
      ${includeResolved ? '' : 'WHERE a.resolved = FALSE'}
      ORDER BY a.created_at DESC
      LIMIT 60`,
  )
}

export async function resolveAlert(alertId: string): Promise<void> {
  const sql = await getSql()
  await sql.query(`UPDATE fraud_alerts SET resolved = TRUE WHERE id = $1`, [alertId])
}

// ---------------------------------------------------------------------------
// System health (SAD Monitoring & Observability)
// ---------------------------------------------------------------------------

export interface HealthReport {
  driver: string
  dbLatencyMs: number
  tables: number
  eventsLastHour: number
  avgSearchMs: number
  slowSearchShare: number
  queuedNotifications: number
  heldReservations: number
  expiredReservations: number
  openAlerts: number
}

export async function systemHealth(): Promise<HealthReport> {
  const sql = await getSql()
  const started = Date.now()
  await sql.query('SELECT 1')
  const dbLatencyMs = Date.now() - started

  const row = await sql.one<{
    tables: number
    events_last_hour: number
    avg_search_ms: number
    slow_share: number
    queued_notifications: number
    held_reservations: number
    expired_reservations: number
    open_alerts: number
  }>(
    `SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE')                    AS tables,
      (SELECT COUNT(*)::int FROM event_log WHERE occurred_at > now() - interval '1 hour') AS events_last_hour,
      (SELECT COALESCE(ROUND(AVG(took_ms)),0)::int FROM search_queries)             AS avg_search_ms,
      -- PRD non-functional requirement: search results under 2 seconds.
      (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE took_ms > 2000)
                             / NULLIF(COUNT(*),0), 1), 0)::numeric
         FROM search_queries)                                                       AS slow_share,
      (SELECT COUNT(*)::int FROM notifications WHERE status <> 'sent')              AS queued_notifications,
      (SELECT COUNT(*)::int FROM stock_reservations WHERE status = 'held')          AS held_reservations,
      -- Stranded = still holding stock after its payment window closed. Not
      -- status = 'expired': that is what the sweep sets once it has released a
      -- hold, so counting it made the check fail harder every time it ran.
      (SELECT COUNT(*)::int FROM stock_reservations
        WHERE status = 'held' AND expires_at < now())                               AS expired_reservations,
      (SELECT COUNT(*)::int FROM fraud_alerts WHERE resolved = FALSE)               AS open_alerts
    `,
  )

  return {
    driver: databaseDriver() === 'pglite' ? 'PostgreSQL (embedded / PGlite)' : 'PostgreSQL server',
    dbLatencyMs,
    tables: row?.tables ?? 0,
    eventsLastHour: row?.events_last_hour ?? 0,
    avgSearchMs: row?.avg_search_ms ?? 0,
    slowSearchShare: Number(row?.slow_share ?? 0),
    queuedNotifications: row?.queued_notifications ?? 0,
    heldReservations: row?.held_reservations ?? 0,
    expiredReservations: row?.expired_reservations ?? 0,
    openAlerts: row?.open_alerts ?? 0,
  }
}
