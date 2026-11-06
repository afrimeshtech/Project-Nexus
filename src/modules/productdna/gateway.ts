import { getSql, withTx, type Sql } from '@/db/client'
import { EVENT } from '@/modules/events/service'
import { PRODUCTDNA_LAUNCHED } from '@/lib/launch-productdna'

/**
 * MODULE: productdna - Commerce Integration Gateway (AFRI-PDNA-TIS-001 §9, §11)
 *
 * The one place the two domains meet. "Commerce remains the authority for its
 * own orders, payments and inventory. ProductDNA consumes confirmed
 * commercial events."
 *
 * Outbox: the specification asks Commerce for a transactional outbox, so an
 * event exists exactly when its commercial change committed. Commerce already
 * has one - public.event_log is written inside the same transaction as the
 * change it records, and is append-only (migration 004). The gateway reads it
 * forward by id; Commerce code is not touched at all.
 *
 * Inbox: productdna.processed_events. An event is claimed and handled in one
 * transaction, so a crash between the two re-runs it and a replay is a no-op
 * (acceptance test 13).
 *
 * Never in Commerce's path: the gateway runs after the fact, on a timer, and
 * catches its own failures. A slow or broken ProductDNA delays its own
 * records, never a sale (acceptance test 14; §11 "a delayed ProductDNA event
 * must trigger retry and reconciliation, not loss of the original Commerce
 * transaction").
 *
 * Dormant: drainCommerceOutbox refuses to run until PRODUCTDNA_LAUNCHED.
 */

/** The §9 event vocabulary. */
export type ProductDnaEventType =
  | 'ProductStockReceived'
  | 'ProductStockTransferred'
  | 'ProductSaleConfirmed'
  | 'ProductReturnRequested'
  | 'ProductReturnAccepted'
  | 'ProductReturnRejected'
  | 'ProductRecallIssued'

/** The §9 event envelope - every field the specification requires. */
export interface ProductDnaEvent {
  event_id: string
  event_type: ProductDnaEventType
  occurred_at: string
  source_system: 'AFRIMESH_COMMERCE'
  /** Null until the Commerce product is linked to an identity (Phase 3). */
  product_identity_id: string | null
  batch_id: string | null
  product_serial_id: string | null
  quantity: number
  external_reference: string | null
  actor_reference: string | null
  /** The Commerce product the event concerns, for identity mapping. */
  commerce_product_reference: string | null
}

export const SOURCE_SYSTEM = 'AFRIMESH_COMMERCE' as const

/** How many event ids behind the cursor each read re-checks; see drainCommerceOutbox. */
const CURSOR_LOOKBACK = 1000

/**
 * Which Commerce events become which ProductDNA events. StockSold is
 * published when payment confirms and reserved units become sold
 * (consumeReservations) - after payment, after the inventory deduction,
 * inside that transaction: exactly §11 steps 1-4.
 *
 * Commerce emits no event yet for a stock transfer between businesses, a
 * return request or rejection, or a recall. Those ProductDNA types have no
 * source here until Commerce does; add the mapping when it does.
 */
export const COMMERCE_EVENT_MAP: Readonly<Record<string, ProductDnaEventType>> = {
  [EVENT.StockAdded]: 'ProductStockReceived',
  [EVENT.StockSold]: 'ProductSaleConfirmed',
  [EVENT.StockReturned]: 'ProductReturnAccepted',
}

export interface OutboxRow {
  id: number
  event_type: string
  aggregate_type: string
  aggregate_id: string
  actor_user_id: string | null
  payload: Record<string, unknown>
  occurred_at: Date | string
}

/**
 * Commerce event -> ProductDNA envelope. Pure, so the mapping is tested
 * without a database. `commerceProductId` is resolved by the caller, because
 * a sale event names the inventory item, not the product.
 */
export function toProductDnaEvent(
  row: OutboxRow,
  commerceProductId: string | null,
): ProductDnaEvent | null {
  const type = COMMERCE_EVENT_MAP[row.event_type]
  if (!type) return null
  const qty = Number(row.payload.qty ?? 0)
  const orderId = typeof row.payload.orderId === 'string' ? row.payload.orderId : null
  return {
    event_id: String(row.id),
    event_type: type,
    occurred_at: new Date(row.occurred_at).toISOString(),
    source_system: SOURCE_SYSTEM,
    product_identity_id: null,
    batch_id: null,
    product_serial_id: null,
    quantity: Number.isFinite(qty) ? qty : 0,
    external_reference: orderId,
    actor_reference: row.actor_user_id,
    commerce_product_reference: commerceProductId,
  }
}

export class ProductDnaNotLaunchedError extends Error {
  constructor() {
    super('ProductDNA is not launched (src/lib/launch-productdna.ts)')
  }
}

/**
 * Read the next Commerce events from the outbox and take each one into
 * ProductDNA once. Returns how many were taken.
 *
 * Phase 3 handling is deliberately minimal: an event for a Commerce product
 * that is linked to a ProductDNA identity is RECORDED against that identity;
 * an unlinked one is UNMAPPED - kept in the inbox, so nothing is lost and a
 * later link can replay it. Writing lifecycle events and reconciling sales
 * (§11 steps 5-8) is Phase 3 and Phase 5 work; see docs/productdna.md.
 */
export async function drainCommerceOutbox(limit = 200): Promise<number> {
  if (!PRODUCTDNA_LAUNCHED) throw new ProductDnaNotLaunchedError()
  return drainOutboxNow(limit)
}

/**
 * The gateway itself, without the launch gate. Exported for the database
 * verification script, which proves the inbox and cursor against a real
 * database while the feature is dormant; the running app reaches it only
 * through drainCommerceOutbox.
 */
export async function drainOutboxNow(limit = 200): Promise<number> {
  const sql = await getSql()
  const cursor = await sql.one<{ last_event_id: number }>(
    `SELECT last_event_id FROM productdna.gateway_cursor WHERE source_system = $1`,
    [SOURCE_SYSTEM],
  )
  const after = Number(cursor?.last_event_id ?? 0)
  // Re-read a window behind the cursor. An event's id is taken when its row
  // is written, not when its transaction commits, so a slow transaction can
  // commit a lower id after a higher one was already read - a strict
  // `id > cursor` would skip it for good. The inbox makes the overlap free:
  // anything already taken is filtered out here.
  const rows = await sql.query<OutboxRow>(
    `SELECT e.id, e.event_type, e.aggregate_type, e.aggregate_id, e.actor_user_id, e.payload, e.occurred_at
       FROM event_log e
      WHERE e.id > $1::bigint - $4::bigint AND e.event_type = ANY($2::text[])
        AND NOT EXISTS (SELECT 1 FROM productdna.processed_events p
                         WHERE p.source_system = $5 AND p.event_id = e.id::text)
      ORDER BY e.id LIMIT $3`,
    [after, Object.keys(COMMERCE_EVENT_MAP), limit, CURSOR_LOOKBACK, SOURCE_SYSTEM],
  )

  let taken = 0
  for (const row of rows) {
    try {
      await withTx((tx) => takeEvent(tx, row))
      taken++
    } catch (err) {
      // One bad event must not stall the rest. Record it as FAILED so it is
      // visible and can be retried by clearing its inbox row.
      console.error(`[productdna] event ${row.id} failed`, err)
      await sql.query(
        `INSERT INTO productdna.processed_events (source_system, event_id, event_type, outcome, detail)
         VALUES ($1, $2, $3, 'FAILED', $4) ON CONFLICT DO NOTHING`,
        [SOURCE_SYSTEM, String(row.id), row.event_type, JSON.stringify({ error: String(err) })],
      )
    }
  }
  // The cursor only moves forward, to the highest id read.
  const highest = rows.reduce((max, r) => Math.max(max, Number(r.id)), after)
  if (highest > after) {
    await sql.query(
      `INSERT INTO productdna.gateway_cursor (source_system, last_event_id, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (source_system) DO UPDATE SET last_event_id = EXCLUDED.last_event_id, updated_at = now()`,
      [SOURCE_SYSTEM, highest],
    )
  }
  return taken
}

async function takeEvent(tx: Sql, row: OutboxRow) {
  // Claim first: a replay finds the row and stops here.
  const claimed = await tx.one<{ event_id: string }>(
    `INSERT INTO productdna.processed_events (source_system, event_id, event_type, outcome)
     VALUES ($1, $2, $3, 'IGNORED') ON CONFLICT DO NOTHING RETURNING event_id`,
    [SOURCE_SYSTEM, String(row.id), row.event_type],
  )
  if (!claimed) return

  // Stock events are keyed by inventory item; the product is one lookup away.
  // This read across the boundary is what the gateway is for.
  const item =
    row.aggregate_type === 'inventory_item'
      ? await tx.one<{ product_id: string }>(
          `SELECT product_id FROM inventory_items WHERE id = $1`,
          [row.aggregate_id],
        )
      : null
  const event = toProductDnaEvent(row, item?.product_id ?? null)
  if (!event) return

  const link = event.commerce_product_reference
    ? await tx.one<{ product_identity_id: string }>(
        `SELECT product_identity_id FROM productdna.commerce_product_links
          WHERE commerce_product_reference = $1`,
        [event.commerce_product_reference],
      )
    : null

  await tx.query(
    `UPDATE productdna.processed_events SET outcome = $3, detail = $4
      WHERE source_system = $1 AND event_id = $2`,
    [
      SOURCE_SYSTEM,
      event.event_id,
      link ? 'RECORDED' : 'UNMAPPED',
      JSON.stringify({ ...event, product_identity_id: link?.product_identity_id ?? null }),
    ],
  )
}

const GATEWAY_INTERVAL_MS = 30_000
const globalForGateway = globalThis as unknown as { __afrimeshProductDnaGateway?: NodeJS.Timeout }

/**
 * Starts the gateway on a timer, from instrumentation.ts - only once
 * PRODUCTDNA_LAUNCHED. Same shape as the reservation sweeper: one timer per
 * process, no overlapping runs, failures logged and retried next tick.
 */
export function startProductDnaGateway(): void {
  if (!PRODUCTDNA_LAUNCHED || globalForGateway.__afrimeshProductDnaGateway) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const taken = await drainCommerceOutbox()
      if (taken > 0) console.log(`[productdna] took ${taken} commerce event(s)`)
    } catch (err) {
      console.error('[productdna] gateway run failed', err)
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, GATEWAY_INTERVAL_MS)
  timer.unref()
  globalForGateway.__afrimeshProductDnaGateway = timer
  void tick()
}
