import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'
import { payRider } from '@/modules/wallet/service'
import { distanceKmSqlOn, haversineKm, estimateEtaMinutes } from '@/lib/geo'

/**
 * MODULE: logistics
 *
 * "Rider assignment, route optimisation, multi-stop delivery, delivery
 * tracking, proof of delivery, estimated arrival times, delivery zones."
 * - System Architecture Document, Logistics Engine.
 *
 * A delivery job is created when a seller dispatches an order. It sits on an
 * open board that delivery partners see ranked by how close the pickup is to
 * them, and the first to accept takes it. On completion the rider is paid out
 * of the logistics escrow that the buyer's delivery fee funded.
 *
 * Every function here is also the shape a third-party fleet integration would
 * call, which is what the SAD means by "the logistics engine must expose APIs
 * so third-party delivery providers can integrate".
 */

export type DeliveryStatus =
  'unassigned' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed'

export interface Delivery {
  id: string
  order_id: string
  rider_user_id: string | null
  status: DeliveryStatus
  pickup_lat: number | null
  pickup_lng: number | null
  dropoff_lat: number | null
  dropoff_lng: number | null
  distance_km: number | null
  eta_minutes: number | null
  rider_fee: number
  proof_note: string | null
  assigned_at: Date | null
  picked_up_at: Date | null
  delivered_at: Date | null
  created_at: Date
}

export interface DeliveryJob extends Delivery {
  order_number: string
  order_total: number
  delivery_fee: number
  item_count: number
  seller_name: string
  seller_address: string | null
  seller_phone: string | null
  buyer_name: string
  buyer_phone: string | null
  delivery_address: string | null
  rider_name: string | null
  rider_phone: string | null
  /** Distance from the rider to the pickup point. */
  pickup_distance_km: number
}

export class DeliveryError extends Error {}

/**
 * The rider's cut of the delivery fee, in basis points. The platform keeps the
 * remainder to cover payment processing and support on the logistics leg.
 */
function riderShareBps(): number {
  return Number(process.env.RIDER_SHARE_BPS ?? 8000)
}

export function riderFeeFor(deliveryFee: number): number {
  return Math.round((deliveryFee * riderShareBps()) / 10_000)
}

// ---------------------------------------------------------------------------
// Job creation
// ---------------------------------------------------------------------------

/**
 * Raise a delivery job for a dispatched order. Called from the order service
 * inside the dispatch transaction, so an order can never be marked dispatched
 * without a corresponding job existing.
 *
 * Pickup-fulfilment orders get no job: nobody is carrying anything.
 */
export async function requestDelivery(
  tx: Sql,
  order: {
    id: string
    order_number: string
    fulfilment: string
    delivery_fee: number
    delivery_lat: number | null
    delivery_lng: number | null
    seller_org_id: string
  },
): Promise<Delivery | null> {
  if (order.fulfilment !== 'delivery' || order.delivery_fee <= 0) return null

  const seller = await tx.one<{ lat: number; lng: number }>(
    `SELECT lat, lng FROM organisations WHERE id = $1`,
    [order.seller_org_id],
  )
  if (!seller) return null

  const distance =
    order.delivery_lat !== null && order.delivery_lng !== null
      ? haversineKm(
          { lat: seller.lat, lng: seller.lng },
          { lat: order.delivery_lat, lng: order.delivery_lng },
        )
      : 0

  const delivery = await tx.one<Delivery>(
    `INSERT INTO deliveries
       (order_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, eta_minutes, rider_fee)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING *`,
    [
      order.id,
      seller.lat,
      seller.lng,
      order.delivery_lat,
      order.delivery_lng,
      distance.toFixed(2),
      estimateEtaMinutes(distance, 15),
      riderFeeFor(order.delivery_fee),
    ],
  )
  if (!delivery) return null

  await publish(
    {
      type: EVENT.DeliveryRequested,
      aggregateType: 'delivery',
      aggregateId: delivery.id,
      payload: {
        orderNumber: order.order_number,
        distanceKm: Number(distance.toFixed(2)),
        riderFee: delivery.rider_fee,
      },
    },
    tx,
  )

  return delivery
}

// ---------------------------------------------------------------------------
// The rider's job board
// ---------------------------------------------------------------------------

/**
 * `pickupDistance` is a SQL expression for how far the viewer is from the
 * pickup point. The job board supplies a real one; views where there is no
 * viewer position pass a constant.
 */
function jobSelect(pickupDistance: string): string {
  return `
  SELECT d.*,
         ${pickupDistance} AS pickup_distance_km,
         o.order_number, o.total AS order_total, o.delivery_fee, o.delivery_address,
         (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         s.name AS seller_name, s.address AS seller_address, s.phone AS seller_phone,
         u.full_name AS buyer_name, u.phone AS buyer_phone,
         r.full_name AS rider_name, r.phone AS rider_phone
    FROM deliveries d
    JOIN orders o        ON o.id = d.order_id
    JOIN organisations s ON s.id = o.seller_org_id
    JOIN users u         ON u.id = o.buyer_user_id
    LEFT JOIN users r    ON r.id = d.rider_user_id
`
}

const NO_DISTANCE = '0::numeric'

/**
 * Open jobs, nearest pickup first. This is the "optimised routes" primitive:
 * a rider is shown work that starts near where they already are, rather than
 * a flat chronological queue that would send them across the city.
 */
export async function openJobs(
  rider: { lat: number; lng: number },
  opts: { radiusKm?: number; limit?: number } = {},
): Promise<DeliveryJob[]> {
  const sql = await getSql()
  // Ranked by how far the rider is from the *pickup*, not the drop-off.
  const toPickup = distanceKmSqlOn('d.pickup_lat', 'd.pickup_lng', '$1', '$2')

  return sql.query<DeliveryJob>(
    `${jobSelect(`ROUND(${toPickup}::numeric, 2)`)}
      WHERE d.status = 'unassigned'
        AND o.status IN ('confirmed', 'preparing', 'dispatched')
        AND ${toPickup} <= $3
      ORDER BY ${toPickup} ASC
      LIMIT $4`,
    [rider.lat, rider.lng, opts.radiusKm ?? 20, opts.limit ?? 25],
  )
}

/** Jobs this rider is currently carrying or has completed. */
export async function riderJobs(
  riderUserId: string,
  opts: { active?: boolean; limit?: number } = {},
): Promise<DeliveryJob[]> {
  const sql = await getSql()
  const statusFilter = opts.active ? `AND d.status IN ('assigned', 'picked_up', 'in_transit')` : ''
  return sql.query<DeliveryJob>(
    `${jobSelect(NO_DISTANCE)}
      WHERE d.rider_user_id = $1 ${statusFilter}
      ORDER BY d.created_at DESC
      LIMIT $2`,
    [riderUserId, opts.limit ?? 40],
  )
}

export async function getJob(deliveryId: string): Promise<DeliveryJob | null> {
  const sql = await getSql()
  return sql.one<DeliveryJob>(
    `${jobSelect(NO_DISTANCE)}
      WHERE d.id = $1`,
    [deliveryId],
  )
}

export async function deliveryForOrder(orderId: string): Promise<DeliveryJob | null> {
  const sql = await getSql()
  return sql.one<DeliveryJob>(
    `${jobSelect(NO_DISTANCE)}
      WHERE d.order_id = $1`,
    [orderId],
  )
}

// ---------------------------------------------------------------------------
// Seller-directed dispatch
//
// The open board suits a shop that does not mind who comes. Most shops do:
// they have a rider they trust, or one who is already outside. Assigning by
// name hands the job straight to that person - it skips the board, and the
// rider finds it waiting in their active deliveries.
// ---------------------------------------------------------------------------

export interface RiderOption {
  user_id: string
  full_name: string
  phone: string | null
  /** From the shop, where the rider's saved location is known. */
  distance_km: number | null
  /** Deliveries this rider has completed for this shop. */
  deliveries_for_shop: number
  /** Jobs the rider is carrying right now. */
  active_jobs: number
}

/**
 * Riders a shop can hand an order to: the ones who have delivered for it
 * before, then the nearest others. Suspended accounts never appear.
 */
export async function ridersForShop(
  shop: { orgId: string; lat: number; lng: number },
  opts: { radiusKm?: number; limit?: number } = {},
): Promise<RiderOption[]> {
  const sql = await getSql()
  const fromShop = distanceKmSqlOn('u.default_lat', 'u.default_lng', '$2', '$3')
  return sql.query<RiderOption>(
    `SELECT * FROM (
       SELECT u.id AS user_id, u.full_name, u.phone,
              CASE WHEN u.default_lat IS NULL THEN NULL
                   ELSE ROUND((${fromShop})::numeric, 1) END AS distance_km,
              (SELECT COUNT(*)::int FROM deliveries d JOIN orders o ON o.id = d.order_id
                WHERE d.rider_user_id = u.id AND d.status = 'delivered'
                  AND o.seller_org_id = $1) AS deliveries_for_shop,
              (SELECT COUNT(*)::int FROM deliveries d
                WHERE d.rider_user_id = u.id
                  AND d.status IN ('assigned', 'picked_up', 'in_transit')) AS active_jobs
         FROM users u
        WHERE u.role = 'delivery_partner' AND u.status = 'active'
     ) r
     WHERE r.deliveries_for_shop > 0 OR (r.distance_km IS NOT NULL AND r.distance_km <= $4)
     ORDER BY r.deliveries_for_shop DESC, r.distance_km ASC NULLS LAST
     LIMIT $5`,
    [shop.orgId, shop.lat, shop.lng, opts.radiusKm ?? 15, opts.limit ?? 20],
  )
}

export async function riderIsAvailable(riderUserId: string): Promise<boolean> {
  const sql = await getSql()
  const row = await sql.one<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND role = 'delivery_partner' AND status = 'active'`,
    [riderUserId],
  )
  return Boolean(row)
}

/**
 * Give an open delivery job to a named rider. Only the selling business may,
 * and only while nobody has taken it - the same race guard as `acceptJob`, so
 * a seller assigning and a rider accepting at once cannot both win.
 */
export async function assignRider(
  orderId: string,
  sellerOrgId: string,
  riderUserId: string,
  actorUserId: string,
): Promise<Delivery> {
  return withTx(async (tx) => {
    // Re-checked inside the transaction: availability checked by the caller a
    // moment earlier is advice, this is the guarantee.
    const rider = await tx.one<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM users
        WHERE id = $1 AND role = 'delivery_partner' AND status = 'active'`,
      [riderUserId],
    )
    if (!rider) throw new DeliveryError('That rider is not available.')

    const delivery = await tx.one<Delivery>(
      `UPDATE deliveries d
          SET rider_user_id = $3, status = 'assigned', assigned_at = now()
         FROM orders o
        WHERE d.order_id = $1 AND o.id = d.order_id AND o.seller_org_id = $2
          AND d.status = 'unassigned' AND d.rider_user_id IS NULL
        RETURNING d.*`,
      [orderId, sellerOrgId, riderUserId],
    )
    if (!delivery) {
      throw new DeliveryError('A rider has already taken this delivery, or it has no delivery job.')
    }

    const order = await tx.one<{ order_number: string; buyer_user_id: string }>(
      `SELECT order_number, buyer_user_id FROM orders WHERE id = $1`,
      [orderId],
    )

    await publish(
      {
        type: EVENT.DeliveryAssigned,
        aggregateType: 'delivery',
        aggregateId: delivery.id,
        actorUserId,
        payload: { orderNumber: order?.order_number, riderUserId },
      },
      tx,
    )
    await queueNotification(
      {
        userId: riderUserId,
        title: 'New delivery for you',
        body: `You have been assigned order ${order?.order_number ?? ''}. Collect it from the shop.`,
        category: 'delivery',
        referenceType: 'order',
        referenceId: orderId,
      },
      tx,
    )
    if (order) {
      await queueNotification(
        {
          userId: order.buyer_user_id,
          title: 'A rider has been assigned',
          body: `${rider.full_name} will deliver your order ${order.order_number}.`,
          category: 'delivery',
          referenceType: 'order',
          referenceId: orderId,
        },
        tx,
      )
    }

    return delivery
  })
}

/**
 * A rider hands back a job they were assigned but cannot do. It returns to
 * the open board, so a direct assignment never strands an order with someone
 * who is not coming. Only before pickup - once the goods are with the rider,
 * giving the job back would leave them with nobody accountable for them.
 */
export async function declineJob(deliveryId: string, riderUserId: string): Promise<Delivery> {
  return withTx(async (tx) => {
    const delivery = await tx.one<Delivery>(
      `UPDATE deliveries
          SET rider_user_id = NULL, status = 'unassigned', assigned_at = NULL
        WHERE id = $1 AND rider_user_id = $2 AND status = 'assigned'
        RETURNING *`,
      [deliveryId, riderUserId],
    )
    if (!delivery)
      throw new DeliveryError('That delivery is not yours, or has already been picked up')

    const seller = await tx.one<{ order_number: string; owner_user_id: string | null }>(
      `SELECT o.order_number, s.owner_user_id
         FROM orders o JOIN organisations s ON s.id = o.seller_org_id
        WHERE o.id = $1`,
      [delivery.order_id],
    )
    if (seller?.owner_user_id) {
      await queueNotification(
        {
          userId: seller.owner_user_id,
          title: 'A rider handed back a delivery',
          body: `Order ${seller.order_number} is back on the open job board. Assign another rider or wait for one to accept.`,
          category: 'delivery',
          referenceType: 'order',
          referenceId: delivery.order_id,
        },
        tx,
      )
    }
    return delivery
  })
}

// ---------------------------------------------------------------------------
// Rider actions
// ---------------------------------------------------------------------------

/**
 * Claim a job. The WHERE clause is the race guard: two riders tapping accept
 * at the same moment means one UPDATE matches zero rows and is told the job
 * has gone, rather than both believing they have it.
 */
export async function acceptJob(deliveryId: string, riderUserId: string): Promise<Delivery> {
  return withTx(async (tx) => {
    const delivery = await tx.one<Delivery>(
      `UPDATE deliveries
          SET rider_user_id = $2, status = 'assigned', assigned_at = now()
        WHERE id = $1 AND status = 'unassigned' AND rider_user_id IS NULL
        RETURNING *`,
      [deliveryId, riderUserId],
    )
    if (!delivery) throw new DeliveryError('Another rider has already taken this delivery')

    const order = await tx.one<{ order_number: string; buyer_user_id: string }>(
      `SELECT order_number, buyer_user_id FROM orders WHERE id = $1`,
      [delivery.order_id],
    )

    await publish(
      {
        type: EVENT.DeliveryAccepted,
        aggregateType: 'delivery',
        aggregateId: delivery.id,
        actorUserId: riderUserId,
        payload: { orderNumber: order?.order_number },
      },
      tx,
    )

    if (order) {
      await queueNotification(
        {
          userId: order.buyer_user_id,
          title: 'A rider is on the way',
          body: `Your order ${order.order_number} has been picked up by a delivery partner.`,
          category: 'delivery',
          referenceType: 'order',
          referenceId: delivery.order_id,
        },
        tx,
      )
    }

    return delivery
  })
}

export async function markPickedUp(deliveryId: string, riderUserId: string): Promise<Delivery> {
  return withTx(async (tx) => {
    const delivery = await tx.one<Delivery>(
      `UPDATE deliveries
          SET status = 'picked_up', picked_up_at = now()
        WHERE id = $1 AND rider_user_id = $2 AND status = 'assigned'
        RETURNING *`,
      [deliveryId, riderUserId],
    )
    if (!delivery) throw new DeliveryError('That delivery is not yours, or is not ready for pickup')

    await publish(
      {
        type: EVENT.DeliveryPickedUp,
        aggregateType: 'delivery',
        aggregateId: delivery.id,
        actorUserId: riderUserId,
      },
      tx,
    )
    return delivery
  })
}

/**
 * Proof of delivery. Completing the job also advances the order to delivered
 * and pays the rider - the three have to happen together or a rider could be
 * paid for goods the order never recorded as arriving.
 *
 * The order transition is done here with SQL rather than by calling the order
 * service, because the order service imports this module and a cycle would be
 * worse than the small duplication.
 */
export async function completeDelivery(
  deliveryId: string,
  riderUserId: string,
  proofNote: string,
): Promise<Delivery> {
  return withTx(async (tx) => {
    const delivery = await tx.one<Delivery>(
      `UPDATE deliveries
          SET status = 'delivered', delivered_at = now(), proof_note = $3
        WHERE id = $1 AND rider_user_id = $2 AND status IN ('picked_up', 'in_transit')
        RETURNING *`,
      [deliveryId, riderUserId, proofNote || null],
    )
    if (!delivery) throw new DeliveryError('That delivery is not yours, or has not been picked up')

    const order = await tx.one<{
      id: string
      order_number: string
      buyer_user_id: string
      delivery_fee: number
      status: string
    }>(`SELECT id, order_number, buyer_user_id, delivery_fee, status FROM orders WHERE id = $1`, [
      delivery.order_id,
    ])
    if (!order) throw new DeliveryError('Order not found')

    if (['dispatched', 'preparing', 'confirmed'].includes(order.status)) {
      await tx.query(`UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = $1`, [
        order.id,
      ])
      await tx.query(
        `INSERT INTO order_events (order_id, status, note, actor_user_id)
         VALUES ($1, 'delivered', $2, $3)`,
        [order.id, 'Delivered by delivery partner', riderUserId],
      )
      await publish(
        {
          type: EVENT.OrderDelivered,
          aggregateType: 'order',
          aggregateId: order.id,
          actorUserId: riderUserId,
        },
        tx,
      )
    }

    await payRider(tx, {
      riderUserId,
      riderFee: delivery.rider_fee,
      deliveryFee: order.delivery_fee,
      orderNumber: order.order_number,
    })

    await publish(
      {
        type: EVENT.DeliveryCompleted,
        aggregateType: 'delivery',
        aggregateId: delivery.id,
        actorUserId: riderUserId,
        payload: { orderNumber: order.order_number, riderFee: delivery.rider_fee },
      },
      tx,
    )

    await queueNotification(
      {
        userId: order.buyer_user_id,
        title: 'Order delivered',
        body: `Order ${order.order_number} has arrived. Confirm receipt to release payment and earn cashback.`,
        category: 'delivery',
        referenceType: 'order',
        referenceId: order.id,
      },
      tx,
    )
    await queueNotification(
      {
        userId: riderUserId,
        title: 'Delivery complete',
        body: `You earned your fee for order ${order.order_number}. It is in your wallet.`,
        category: 'delivery',
        referenceType: 'order',
        referenceId: order.id,
      },
      tx,
    )

    return delivery
  })
}

// ---------------------------------------------------------------------------

/**
 * The seller delivered it themselves. Take the job off the board so a rider
 * cannot accept work that has already been done.
 */
export async function cancelOpenJob(tx: Sql, orderId: string): Promise<void> {
  await tx.query(
    `UPDATE deliveries SET status = 'failed'
      WHERE order_id = $1 AND status = 'unassigned'`,
    [orderId],
  )
}

/** Did a delivery partner complete this order, and therefore get paid? */
export async function riderWasPaid(tx: Sql, orderId: string): Promise<boolean> {
  const row = await tx.one<{ id: string }>(
    `SELECT id FROM deliveries
      WHERE order_id = $1 AND status = 'delivered' AND rider_user_id IS NOT NULL`,
    [orderId],
  )
  return Boolean(row)
}

export async function riderStats(riderUserId: string) {
  const sql = await getSql()
  const row = await sql.one<{
    completed: number
    active: number
    earned: number
    distance_km: number
    earned_30d: number
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'delivered')::int                       AS completed,
      COUNT(*) FILTER (WHERE status IN ('assigned','picked_up','in_transit'))::int AS active,
      COALESCE(SUM(rider_fee) FILTER (WHERE status = 'delivered'), 0)::bigint  AS earned,
      COALESCE(SUM(distance_km) FILTER (WHERE status = 'delivered'), 0)        AS distance_km,
      COALESCE(SUM(rider_fee) FILTER (
        WHERE status = 'delivered' AND delivered_at > now() - interval '30 days'
      ), 0)::bigint                                                            AS earned_30d
     FROM deliveries WHERE rider_user_id = $1`,
    [riderUserId],
  )
  return row ?? { completed: 0, active: 0, earned: 0, distance_km: 0, earned_30d: 0 }
}

/** Platform-wide logistics view for the admin console. */
export async function logisticsOverview() {
  const sql = await getSql()
  const row = await sql.one<{
    open_jobs: number
    in_progress: number
    completed: number
    avg_distance: number
    riders: number
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'unassigned')::int                            AS open_jobs,
      COUNT(*) FILTER (WHERE status IN ('assigned','picked_up','in_transit'))::int   AS in_progress,
      COUNT(*) FILTER (WHERE status = 'delivered')::int                              AS completed,
      COALESCE(ROUND(AVG(distance_km) FILTER (WHERE status = 'delivered'), 1), 0)    AS avg_distance,
      (SELECT COUNT(*)::int FROM users WHERE role = 'delivery_partner')              AS riders
     FROM deliveries`,
  )
  return row ?? { open_jobs: 0, in_progress: 0, completed: 0, avg_distance: 0, riders: 0 }
}
