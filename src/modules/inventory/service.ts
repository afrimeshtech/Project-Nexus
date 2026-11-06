import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'

/**
 * MODULE: inventory - the Distributed Commerce Inventory Engine (DCIE)
 *
 * From the CTO Inventory Engineering Recommendation:
 *   "Inventory should be distributed, not centralised. AfriMesh does not own
 *    stock. It provides visibility into stock held by manufacturers, dealer
 *    warehouses, merchants and neighbourhood retailers."
 *
 * So every row here belongs to exactly one organisation. The platform
 * aggregates availability; it never takes ownership.
 *
 * Two rules drive the whole design:
 *
 *  1. Recommendation engines read `qty_available`, never total stock. Reserved
 *     units are invisible to discovery, which is what stops overselling.
 *  2. Every movement writes an immutable `inventory_ledger` row. The quantity
 *     columns are a materialised view of that ledger and can always be
 *     rebuilt from it - that is what makes the numbers auditable.
 */

export type MovementType =
  | 'received'
  | 'transferred'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'damage'
  | 'expiry'
  | 'reserved'
  | 'released'

export interface InventoryItem {
  id: string
  organisation_id: string
  product_id: string
  qty_available: number
  qty_reserved: number
  qty_incoming: number
  qty_sold: number
  qty_returned: number
  qty_damaged: number
  reorder_level: number
  retail_price: number | null
  wholesale_price: number | null
  promo_price: number | null
  min_order_qty: number
  currency: string
  lat: number
  lng: number
  is_listed: boolean
  updated_at: Date
}

export interface InventoryRow extends InventoryItem {
  product_name: string
  product_image: string | null
  gtin: string | null
  unit_of_measure: string
  pack_size: string | null
  brand_name: string | null
  brand_logo: string | null
  category_name: string | null
  category_slug: string | null
  requires_batch: boolean
}

export class InsufficientStockError extends Error {
  readonly available: number
  constructor(available: number) {
    super('Not enough stock available')
    this.available = available
  }
}

const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES ?? 20)

// ---------------------------------------------------------------------------
// Ledger - append only. Nothing in this module mutates a ledger row.
// ---------------------------------------------------------------------------

async function writeLedger(
  sql: Sql,
  entry: {
    itemId: string
    organisationId: string
    productId: string
    movement: MovementType
    qtyDelta: number
    qtyAfter: number
    referenceType?: string | null
    referenceId?: string | null
    actorUserId?: string | null
    note?: string | null
  },
) {
  await sql.query(
    `INSERT INTO inventory_ledger
       (inventory_item_id, organisation_id, product_id, movement, qty_delta, qty_after,
        reference_type, reference_id, actor_user_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      entry.itemId,
      entry.organisationId,
      entry.productId,
      entry.movement,
      entry.qtyDelta,
      entry.qtyAfter,
      entry.referenceType ?? null,
      entry.referenceId ?? null,
      entry.actorUserId ?? null,
      entry.note ?? null,
    ],
  )
}

// ---------------------------------------------------------------------------
// Listing stock
// ---------------------------------------------------------------------------

export interface UpsertStockInput {
  organisationId: string
  productId: string
  qty?: number
  retailPrice?: number | null
  wholesalePrice?: number | null
  promoPrice?: number | null
  minOrderQty?: number
  reorderLevel?: number
  isListed?: boolean
  actorUserId?: string | null
  note?: string | null
}

/**
 * Create or restock a listing. `qty` is *added* to available stock, because
 * that is what physically happens when a delivery arrives; use
 * `setStockLevel` for a stock-take correction.
 */
export async function upsertStock(input: UpsertStockInput): Promise<InventoryItem> {
  return withTx(async (tx) => {
    const org = await tx.one<{ lat: number; lng: number }>(
      `SELECT lat, lng FROM organisations WHERE id = $1`,
      [input.organisationId],
    )
    if (!org) throw new Error('Organisation not found')

    const qty = input.qty ?? 0

    const item = await tx.one<InventoryItem>(
      `INSERT INTO inventory_items
         (organisation_id, product_id, qty_available, retail_price, wholesale_price,
          promo_price, min_order_qty, reorder_level, is_listed, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (organisation_id, product_id) DO UPDATE SET
         qty_available   = inventory_items.qty_available + EXCLUDED.qty_available,
         retail_price    = COALESCE(EXCLUDED.retail_price,    inventory_items.retail_price),
         wholesale_price = COALESCE(EXCLUDED.wholesale_price, inventory_items.wholesale_price),
         promo_price     = COALESCE(EXCLUDED.promo_price,     inventory_items.promo_price),
         min_order_qty   = EXCLUDED.min_order_qty,
         reorder_level   = EXCLUDED.reorder_level,
         is_listed       = EXCLUDED.is_listed,
         updated_at      = now()
       RETURNING *`,
      [
        input.organisationId,
        input.productId,
        qty,
        input.retailPrice ?? null,
        input.wholesalePrice ?? null,
        input.promoPrice ?? null,
        input.minOrderQty ?? 1,
        input.reorderLevel ?? 5,
        input.isListed ?? true,
        org.lat,
        org.lng,
      ],
    )
    if (!item) throw new Error('Failed to write inventory')

    if (qty > 0) {
      await writeLedger(tx, {
        itemId: item.id,
        organisationId: item.organisation_id,
        productId: item.product_id,
        movement: 'received',
        qtyDelta: qty,
        qtyAfter: item.qty_available,
        actorUserId: input.actorUserId,
        note: input.note ?? 'Stock received',
      })
      await publish(
        {
          type: EVENT.StockAdded,
          aggregateType: 'inventory_item',
          aggregateId: item.id,
          actorUserId: input.actorUserId,
          payload: { productId: item.product_id, qty, qtyAfter: item.qty_available },
        },
        tx,
      )
    }
    return item
  })
}

/** Stock-take correction: set available stock to an absolute figure. */
export async function setStockLevel(
  itemId: string,
  newQty: number,
  actorUserId?: string | null,
  note = 'Stock count adjustment',
): Promise<InventoryItem> {
  return withTx(async (tx) => {
    const before = await tx.one<InventoryItem>(`SELECT * FROM inventory_items WHERE id = $1`, [
      itemId,
    ])
    if (!before) throw new Error('Inventory item not found')

    const delta = newQty - before.qty_available
    const item = await tx.one<InventoryItem>(
      `UPDATE inventory_items SET qty_available = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [itemId, newQty],
    )
    if (!item) throw new Error('Inventory item not found')

    await writeLedger(tx, {
      itemId,
      organisationId: item.organisation_id,
      productId: item.product_id,
      movement: 'adjustment',
      qtyDelta: delta,
      qtyAfter: newQty,
      actorUserId,
      note,
    })
    await publish(
      {
        type: EVENT.StockAdjusted,
        aggregateType: 'inventory_item',
        aggregateId: itemId,
        actorUserId,
        payload: { delta, qtyAfter: newQty },
      },
      tx,
    )
    await checkLowStock(tx, item)
    return item
  })
}

export async function updatePricing(
  itemId: string,
  prices: {
    retailPrice?: number | null
    wholesalePrice?: number | null
    promoPrice?: number | null
    minOrderQty?: number
    isListed?: boolean
  },
  actorUserId?: string | null,
): Promise<void> {
  const sql = await getSql()
  type Prices = { retail_price: number | null; wholesale_price: number | null; promo_price: number | null }
  const before = await sql.one<Prices & { organisation_id: string; product_id: string }>(
    `SELECT retail_price, wholesale_price, promo_price, organisation_id, product_id
       FROM inventory_items WHERE id = $1`,
    [itemId],
  )
  const after = await sql.one<Prices>(
    `UPDATE inventory_items SET
       retail_price    = COALESCE($2, retail_price),
       wholesale_price = COALESCE($3, wholesale_price),
       promo_price     = $4,
       min_order_qty   = COALESCE($5, min_order_qty),
       is_listed       = COALESCE($6, is_listed),
       updated_at      = now()
     WHERE id = $1
     RETURNING retail_price, wholesale_price, promo_price`,
    [
      itemId,
      prices.retailPrice ?? null,
      prices.wholesalePrice ?? null,
      prices.promoPrice ?? null,
      prices.minOrderQty ?? null,
      prices.isListed ?? null,
    ],
  )

  // A price is what a buyer pays, so a change to one is audited (Security &
  // Trust Framework §E) - only when a price actually moved, not on every save.
  const keys = ['retail_price', 'wholesale_price', 'promo_price'] as const
  if (before && after && keys.some((k) => Number(before[k] ?? 0) !== Number(after[k] ?? 0))) {
    await publish(
      {
        type: EVENT.PriceChanged,
        aggregateType: 'inventory_item',
        aggregateId: itemId,
        actorUserId: actorUserId ?? null,
        payload: {
          organisationId: before.organisation_id,
          productId: before.product_id,
          from: Object.fromEntries(keys.map((k) => [k, before[k]])),
          to: Object.fromEntries(keys.map((k) => [k, after[k]])),
        },
      },
      sql,
    )
  }
}

// ---------------------------------------------------------------------------
// Reservation (Inventory doc §4)
// "When an order is placed: reserve stock immediately. Release it if payment
//  fails or the reservation expires."
// ---------------------------------------------------------------------------

export async function reserveStock(
  tx: Sql,
  itemId: string,
  qty: number,
  orderId: string,
  actorUserId?: string | null,
): Promise<string> {
  // The WHERE clause is the concurrency guard: two shoppers racing for the
  // last unit means one UPDATE matches zero rows and is rejected. No
  // read-then-write gap, so no oversell.
  const updated = await tx.one<InventoryItem>(
    `UPDATE inventory_items
        SET qty_available = qty_available - $2,
            qty_reserved  = qty_reserved + $2,
            updated_at    = now()
      WHERE id = $1 AND qty_available >= $2
      RETURNING *`,
    [itemId, qty],
  )

  if (!updated) {
    const current = await tx.one<{ qty_available: number }>(
      `SELECT qty_available FROM inventory_items WHERE id = $1`,
      [itemId],
    )
    throw new InsufficientStockError(current?.qty_available ?? 0)
  }

  const reservation = await tx.one<{ id: string }>(
    `INSERT INTO stock_reservations (inventory_item_id, order_id, qty, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
     RETURNING id`,
    [itemId, orderId, qty, String(RESERVATION_TTL_MINUTES)],
  )

  await writeLedger(tx, {
    itemId,
    organisationId: updated.organisation_id,
    productId: updated.product_id,
    movement: 'reserved',
    qtyDelta: -qty,
    qtyAfter: updated.qty_available,
    referenceType: 'order',
    referenceId: orderId,
    actorUserId,
  })

  await publish(
    {
      type: EVENT.StockReserved,
      aggregateType: 'inventory_item',
      aggregateId: itemId,
      actorUserId,
      payload: { qty, orderId, qtyAfter: updated.qty_available },
    },
    tx,
  )

  return reservation!.id
}

/** Payment failed or the buyer cancelled: put the units back on the shelf. */
export async function releaseReservations(
  orderId: string,
  reason: 'released' | 'expired' = 'released',
  tx?: Sql,
): Promise<number> {
  const run = async (db: Sql) => {
    // Claim the holds before touching stock. The scheduled sweep, the order
    // page's opportunistic sweep and a buyer's cancel can all reach the same
    // order at once; with a SELECT-then-UPDATE each of them saw the holds as
    // 'held' and put the units back again. The conditional UPDATE row-locks
    // each hold, so a racing release re-checks `status = 'held'`, matches
    // nothing, and restores no stock.
    const held = await db.query<{ id: string; inventory_item_id: string; qty: number }>(
      `UPDATE stock_reservations SET status = $2, resolved_at = now()
        WHERE order_id = $1 AND status = 'held'
        RETURNING id, inventory_item_id, qty`,
      [orderId, reason],
    )

    for (const r of held) {
      const item = await db.one<InventoryItem>(
        `UPDATE inventory_items
            SET qty_available = qty_available + $2,
                qty_reserved  = GREATEST(qty_reserved - $2, 0),
                updated_at    = now()
          WHERE id = $1
          RETURNING *`,
        [r.inventory_item_id, r.qty],
      )
      if (item) {
        await writeLedger(db, {
          itemId: item.id,
          organisationId: item.organisation_id,
          productId: item.product_id,
          movement: 'released',
          qtyDelta: r.qty,
          qtyAfter: item.qty_available,
          referenceType: 'order',
          referenceId: orderId,
          note: reason === 'expired' ? 'Reservation expired' : 'Reservation released',
        })
        await publish(
          {
            type: EVENT.StockReleased,
            aggregateType: 'inventory_item',
            aggregateId: item.id,
            payload: { qty: r.qty, orderId, reason },
          },
          db,
        )
      }
    }
    return held.length
  }

  return tx ? run(tx) : withTx(run)
}

/** Payment succeeded and the seller fulfilled: reserved units become sold. */
export async function consumeReservations(orderId: string, tx?: Sql): Promise<void> {
  const run = async (db: Sql) => {
    const held = await db.query<{ id: string; inventory_item_id: string; qty: number }>(
      `SELECT id, inventory_item_id, qty FROM stock_reservations
        WHERE order_id = $1 AND status = 'held'`,
      [orderId],
    )

    for (const r of held) {
      const item = await db.one<InventoryItem>(
        `UPDATE inventory_items
            SET qty_reserved = GREATEST(qty_reserved - $2, 0),
                qty_sold     = qty_sold + $2,
                updated_at   = now()
          WHERE id = $1
          RETURNING *`,
        [r.inventory_item_id, r.qty],
      )
      await db.query(
        `UPDATE stock_reservations SET status = 'consumed', resolved_at = now() WHERE id = $1`,
        [r.id],
      )
      if (item) {
        await writeLedger(db, {
          itemId: item.id,
          organisationId: item.organisation_id,
          productId: item.product_id,
          movement: 'sale',
          qtyDelta: -r.qty,
          qtyAfter: item.qty_available,
          referenceType: 'order',
          referenceId: orderId,
        })
        await publish(
          {
            type: EVENT.StockSold,
            aggregateType: 'inventory_item',
            aggregateId: item.id,
            payload: { qty: r.qty, orderId },
          },
          db,
        )
        await checkLowStock(db, item)
      }
    }
  }
  return tx ? run(tx) : withTx(run)
}

/**
 * Returned goods go back into available stock and are recorded as returns.
 *
 * Takes an optional `tx` like every other write in this module. A refund has
 * to reverse the money and restore the goods atomically, so `cancelOrder`
 * calls this from inside its own transaction - and opening a second one here
 * would deadlock against a single-connection driver.
 */
export async function returnStock(
  itemId: string,
  qty: number,
  orderId: string | null,
  actorUserId?: string | null,
  tx?: Sql,
): Promise<void> {
  const run = async (db: Sql) => {
    const item = await db.one<InventoryItem>(
      `UPDATE inventory_items
          SET qty_available = qty_available + $2,
              qty_returned  = qty_returned + $2,
              updated_at    = now()
        WHERE id = $1
        RETURNING *`,
      [itemId, qty],
    )
    if (!item) throw new Error('Inventory item not found')

    await writeLedger(db, {
      itemId,
      organisationId: item.organisation_id,
      productId: item.product_id,
      movement: 'return',
      qtyDelta: qty,
      qtyAfter: item.qty_available,
      referenceType: orderId ? 'order' : null,
      referenceId: orderId,
      actorUserId,
    })
    await publish(
      {
        type: EVENT.StockReturned,
        aggregateType: 'inventory_item',
        aggregateId: itemId,
        actorUserId,
        payload: { qty, orderId },
      },
      db,
    )
  }
  return tx ? run(tx) : withTx(run)
}

/**
 * Sweep expired holds. Runs on demand from the order pages and can be wired to
 * a scheduled job; either way an abandoned checkout cannot strand stock.
 */
export async function expireStaleReservations(): Promise<number> {
  const sql = await getSql()
  const stale = await sql.query<{ order_id: string }>(
    `SELECT DISTINCT order_id FROM stock_reservations
      WHERE status = 'held' AND expires_at < now() AND order_id IS NOT NULL`,
  )
  let released = 0
  for (const row of stale) {
    released += await releaseReservations(row.order_id, 'expired')
    await sql.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = now(),
              cancel_reason = 'Payment not completed in time'
        WHERE id = $1 AND status = 'pending_payment'`,
      [row.order_id],
    )
  }
  return released
}

// ---------------------------------------------------------------------------
// Low stock alerts
// ---------------------------------------------------------------------------

async function checkLowStock(sql: Sql, item: InventoryItem) {
  if (item.qty_available > item.reorder_level) return
  await publish(
    {
      type: EVENT.LowStock,
      aggregateType: 'inventory_item',
      aggregateId: item.id,
      payload: {
        organisationId: item.organisation_id,
        productId: item.product_id,
        qtyAvailable: item.qty_available,
        reorderLevel: item.reorder_level,
      },
    },
    sql,
  )
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listInventory(
  organisationId: string,
  opts: { search?: string; lowOnly?: boolean; limit?: number } = {},
): Promise<InventoryRow[]> {
  const sql = await getSql()
  const params: unknown[] = [organisationId]
  let where = `i.organisation_id = $1`

  if (opts.search) {
    params.push(`%${opts.search.toLowerCase()}%`)
    where += ` AND (lower(p.name) LIKE $${params.length} OR lower(COALESCE(p.gtin,'')) LIKE $${params.length})`
  }
  if (opts.lowOnly) where += ` AND i.qty_available <= i.reorder_level`

  params.push(opts.limit ?? 200)

  return sql.query<InventoryRow>(
    `SELECT i.*,
            p.name AS product_name, p.image_url AS product_image, p.gtin,
            p.unit_of_measure, p.pack_size, p.requires_batch,
            b.name AS brand_name, b.logo_url AS brand_logo,
            c.name AS category_name, c.slug AS category_slug
       FROM inventory_items i
       JOIN products p   ON p.id = i.product_id
  LEFT JOIN brands b     ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY (i.qty_available <= i.reorder_level) DESC, p.name ASC
      LIMIT $${params.length}`,
    params,
  )
}

export async function getInventoryItem(itemId: string): Promise<InventoryRow | null> {
  const sql = await getSql()
  return sql.one<InventoryRow>(
    `SELECT i.*, p.name AS product_name, p.image_url AS product_image, p.gtin,
            p.unit_of_measure, p.pack_size, p.requires_batch,
            b.name AS brand_name, b.logo_url AS brand_logo,
            c.name AS category_name, c.slug AS category_slug
       FROM inventory_items i
       JOIN products p ON p.id = i.product_id
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id
      WHERE i.id = $1`,
    [itemId],
  )
}

export async function inventoryLedger(itemId: string, limit = 50) {
  const sql = await getSql()
  return sql.query<{
    id: number
    movement: MovementType
    qty_delta: number
    qty_after: number
    reference_type: string | null
    reference_id: string | null
    note: string | null
    created_at: Date
  }>(
    `SELECT id, movement, qty_delta, qty_after, reference_type, reference_id, note, created_at
       FROM inventory_ledger WHERE inventory_item_id = $1
      ORDER BY id DESC LIMIT $2`,
    [itemId, limit],
  )
}

/** Batch & expiry tracking (Inventory doc §7). */
export async function addBatch(
  itemId: string,
  batch: {
    batchNumber: string
    manufacturedOn?: string | null
    expiresOn?: string | null
    qty: number
  },
) {
  const sql = await getSql()
  await sql.query(
    `INSERT INTO inventory_batches (inventory_item_id, batch_number, manufactured_on, expires_on, qty)
     VALUES ($1,$2,$3,$4,$5)`,
    [itemId, batch.batchNumber, batch.manufacturedOn ?? null, batch.expiresOn ?? null, batch.qty],
  )
}

export async function listBatches(itemId: string) {
  const sql = await getSql()
  return sql.query<{
    id: string
    batch_number: string
    manufactured_on: Date | null
    expires_on: Date | null
    qty: number
  }>(
    `SELECT id, batch_number, manufactured_on, expires_on, qty
       FROM inventory_batches WHERE inventory_item_id = $1 ORDER BY expires_on NULLS LAST`,
    [itemId],
  )
}

/** Batches expiring inside `days` - drives the expiry watchlist on dashboards. */
export async function expiringBatches(organisationId: string, days = 60) {
  const sql = await getSql()
  return sql.query<{
    id: string
    batch_number: string
    expires_on: Date
    qty: number
    product_name: string
    days_left: number
  }>(
    `SELECT bt.id, bt.batch_number, bt.expires_on, bt.qty, p.name AS product_name,
            (bt.expires_on - CURRENT_DATE)::int AS days_left
       FROM inventory_batches bt
       JOIN inventory_items i ON i.id = bt.inventory_item_id
       JOIN products p ON p.id = i.product_id
      WHERE i.organisation_id = $1
        AND bt.expires_on IS NOT NULL
        AND bt.expires_on <= CURRENT_DATE + ($2 || ' days')::interval
      ORDER BY bt.expires_on ASC`,
    [organisationId, String(days)],
  )
}

/** Inventory KPIs for a seller dashboard (Inventory doc "Key Performance Indicators"). */
export async function inventoryStats(organisationId: string) {
  const sql = await getSql()
  const row = await sql.one<{
    skus: number
    units_available: number
    units_reserved: number
    low_stock: number
    out_of_stock: number
    stock_value: number
  }>(
    `SELECT COUNT(*)::int                                            AS skus,
            COALESCE(SUM(qty_available), 0)::int                     AS units_available,
            COALESCE(SUM(qty_reserved), 0)::int                      AS units_reserved,
            COUNT(*) FILTER (WHERE qty_available <= reorder_level AND qty_available > 0)::int AS low_stock,
            COUNT(*) FILTER (WHERE qty_available = 0)::int           AS out_of_stock,
            COALESCE(SUM(qty_available * COALESCE(retail_price, wholesale_price, 0)), 0)::bigint AS stock_value
       FROM inventory_items WHERE organisation_id = $1`,
    [organisationId],
  )
  return (
    row ?? {
      skus: 0,
      units_available: 0,
      units_reserved: 0,
      low_stock: 0,
      out_of_stock: 0,
      stock_value: 0,
    }
  )
}
