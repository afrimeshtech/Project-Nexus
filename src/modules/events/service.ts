import { getSql, type Sql } from '@/db/client'

/**
 * MODULE: events
 *
 * "Comprehensive event logging from day one to support future analytics, AI,
 * and graph-based intelligence" - PRD, CTO Technical Note.
 *
 * Every meaningful state change in the platform is published here. Today the
 * bus is in-process and durable in the `event_log` table. That table is the
 * seam: when throughput demands it, `publish()` also writes to an Apache Kafka
 * topic and subscribers move out of process, with no change to callers.
 *
 * The log is append-only and forms the immutable audit trail the SAD requires.
 */

export const EVENT = {
  // identity
  UserRegistered: 'user.registered',
  UserLoggedIn: 'user.logged_in',
  OtpIssued: 'otp.issued',

  // organisations
  OrganisationRegistered: 'organisation.registered',
  OrganisationVerified: 'organisation.verified',
  OrganisationRejected: 'organisation.rejected',
  MemberAdded: 'organisation.member_added',
  MemberRemoved: 'organisation.member_removed',

  // catalog
  ProductCreated: 'product.created',
  ProductBlocked: 'product.blocked',
  ProductImageUpdated: 'product.image_updated',

  // inventory - named exactly as the Inventory Engineering Recommendation §10
  StockAdded: 'StockAdded',
  StockReserved: 'StockReserved',
  StockReleased: 'StockReleased',
  StockSold: 'StockSold',
  StockReturned: 'StockReturned',
  StockAdjusted: 'StockAdjusted',
  LowStock: 'inventory.low_stock',

  // orders
  OrderPlaced: 'order.placed',
  OrderConfirmed: 'order.confirmed',
  OrderDispatched: 'order.dispatched',
  OrderDelivered: 'order.delivered',
  OrderCompleted: 'order.completed',
  OrderCancelled: 'order.cancelled',

  // payments + wallet
  PaymentInitiated: 'payment.initiated',
  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  WalletCredited: 'wallet.credited',
  WalletDebited: 'wallet.debited',
  PayoutRequested: 'payout.requested',
  PayoutPaid: 'payout.paid',
  PayoutFailed: 'payout.failed',
  SettlementPaid: 'settlement.paid',
  RiderPaid: 'rider.paid',
  CashbackEarned: 'cashback.earned',

  // rewards
  ReferralCreated: 'referral.created',
  ReferralRewarded: 'referral.rewarded',
  PointsRedeemed: 'points.redeemed',

  // logistics
  DeliveryRequested: 'delivery.requested',
  DeliveryAccepted: 'delivery.accepted',
  DeliveryAssigned: 'delivery.assigned',
  DeliveryPickedUp: 'delivery.picked_up',
  DeliveryCompleted: 'delivery.completed',

  // messaging
  MessageSent: 'message.sent',

  // discovery / demand intelligence
  SearchPerformed: 'search.performed',
  ProductViewed: 'product.viewed',
  RatingSubmitted: 'rating.submitted',

  // public API (CIM Volume III §9)
  ApiKeyIssued: 'api_key.issued',
  ApiKeyRevoked: 'api_key.revoked',

  // risk
  FraudSignal: 'fraud.signal',
} as const

export type EventType = (typeof EVENT)[keyof typeof EVENT]

export interface DomainEvent {
  type: EventType
  aggregateType: string
  aggregateId: string
  actorUserId?: string | null
  payload?: Record<string, unknown>
}

type Handler = (event: DomainEvent, tx: Sql) => Promise<void>

const handlers = new Map<string, Handler[]>()

/**
 * Register an in-process reaction to an event. Handlers run inside the
 * publisher's transaction so a failed side effect rolls the whole operation
 * back - which is what we want while this is a monolith. Once these move to
 * Kafka consumers they become eventually consistent instead.
 */
export function on(type: EventType, handler: Handler): void {
  const list = handlers.get(type) ?? []
  list.push(handler)
  handlers.set(type, list)
}

/**
 * Append an event to the immutable log and run its subscribers.
 * Pass `tx` when publishing from inside a transaction.
 */
export async function publish(event: DomainEvent, tx?: Sql): Promise<void> {
  const sql = tx ?? (await getSql())

  await sql.query(
    `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      event.type,
      event.aggregateType,
      event.aggregateId,
      event.actorUserId ?? null,
      JSON.stringify(event.payload ?? {}),
    ],
  )

  for (const handler of handlers.get(event.type) ?? []) {
    await handler(event, sql)
  }
}

export interface EventRecord {
  id: number
  event_type: string
  aggregate_type: string
  aggregate_id: string
  actor_user_id: string | null
  payload: Record<string, unknown>
  occurred_at: Date
}

/** Recent events, for the admin observability view. */
export async function recentEvents(limit = 50, type?: string): Promise<EventRecord[]> {
  const sql = await getSql()
  if (type) {
    return sql.query<EventRecord>(
      `SELECT * FROM event_log WHERE event_type = $1 ORDER BY id DESC LIMIT $2`,
      [type, limit],
    )
  }
  return sql.query<EventRecord>(`SELECT * FROM event_log ORDER BY id DESC LIMIT $1`, [limit])
}

/** Event volume by type over a trailing window - feeds the admin dashboard. */
export async function eventCounts(hours = 24): Promise<{ event_type: string; count: number }[]> {
  const sql = await getSql()
  return sql.query<{ event_type: string; count: number }>(
    `SELECT event_type, COUNT(*)::int AS count
       FROM event_log
      WHERE occurred_at > now() - ($1 || ' hours')::interval
      GROUP BY event_type
      ORDER BY count DESC`,
    [String(hours)],
  )
}

/** One event by its number, with who caused it, for the console's detail view. */
export async function getEvent(id: number): Promise<
  | (EventRecord & {
      actor_name: string | null
      actor_role: string | null
      actor_phone: string | null
      actor_email: string | null
    })
  | null
> {
  const sql = await getSql()
  return sql.one(
    `SELECT e.*, u.full_name AS actor_name, u.role::text AS actor_role,
            u.phone AS actor_phone, u.email AS actor_email
       FROM event_log e LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.id = $1`,
    [id],
  )
}

/** Everything else that has happened to the same record, newest first. */
export async function eventsForAggregate(
  aggregateType: string,
  aggregateId: string,
  limit = 30,
): Promise<EventRecord[]> {
  const sql = await getSql()
  return sql.query<EventRecord>(
    `SELECT * FROM event_log WHERE aggregate_type = $1 AND aggregate_id = $2
      ORDER BY id DESC LIMIT $3`,
    [aggregateType, aggregateId, limit],
  )
}

export interface AggregateDescription {
  /** A name a person recognises: an order number, a shop, a product. */
  label: string
  /** Supporting detail - status, amounts, who is involved. */
  detail: string | null
  /** Where in the app to look at it, when there is such a page. */
  href: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const naira = (minor: number | string | null) =>
  minor == null
    ? null
    : `₦${(Number(minor) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`

/**
 * Turns an event's aggregate - a type and an id - into something an operator
 * can read. Records that no longer exist (deleted, or ids from a reset
 * database) come back as null rather than failing the page.
 */
export async function describeAggregate(
  type: string,
  id: string,
): Promise<AggregateDescription | null> {
  if (!UUID.test(id)) return null
  const sql = await getSql()
  switch (type) {
    case 'order': {
      const o = await sql.one<{
        order_number: string
        status: string
        total: number
        buyer: string | null
        seller: string | null
      }>(
        `SELECT o.order_number, o.status::text AS status, o.total, u.full_name AS buyer, s.name AS seller
           FROM orders o LEFT JOIN users u ON u.id = o.buyer_user_id
           LEFT JOIN organisations s ON s.id = o.seller_org_id WHERE o.id = $1`,
        [id],
      )
      return (
        o && {
          label: `Order ${o.order_number}`,
          detail: [
            o.status.replace(/_/g, ' '),
            naira(o.total),
            o.buyer && `buyer ${o.buyer}`,
            o.seller && `seller ${o.seller}`,
          ]
            .filter(Boolean)
            .join(' · '),
          href: null,
        }
      )
    }
    case 'organisation': {
      const o = await sql.one<{
        name: string
        slug: string
        type: string
        status: string
        verification: string
        city: string | null
      }>(
        `SELECT name, slug, type::text AS type, status::text AS status, verification::text AS verification, city
           FROM organisations WHERE id = $1`,
        [id],
      )
      return (
        o && {
          label: o.name,
          detail: [o.type, o.city, o.status, o.verification].filter(Boolean).join(' · '),
          href: `/admin/organisations?q=${encodeURIComponent(o.name)}`,
        }
      )
    }
    case 'user': {
      const u = await sql.one<{
        full_name: string
        role: string
        phone: string | null
        email: string | null
      }>(`SELECT full_name, role::text AS role, phone, email FROM users WHERE id = $1`, [id])
      return (
        u && {
          label: u.full_name,
          detail: [u.role.replace(/_/g, ' '), u.phone, u.email].filter(Boolean).join(' · '),
          href: null,
        }
      )
    }
    case 'product': {
      const p = await sql.one<{ name: string; slug: string; status: string }>(
        `SELECT name, slug, status::text AS status FROM products WHERE id = $1`,
        [id],
      )
      return p && { label: p.name, detail: p.status, href: `/product/${id}` }
    }
    case 'inventory_item': {
      const i = await sql.one<{ product: string; shop: string; qty_available: number }>(
        `SELECT p.name AS product, o.name AS shop, i.qty_available
           FROM inventory_items i JOIN products p ON p.id = i.product_id
           JOIN organisations o ON o.id = i.organisation_id WHERE i.id = $1`,
        [id],
      )
      return (
        i && {
          label: `${i.product} at ${i.shop}`,
          detail: `${i.qty_available} available now`,
          href: null,
        }
      )
    }
    case 'delivery': {
      const d = await sql.one<{
        status: string
        order_number: string | null
        rider: string | null
      }>(
        `SELECT d.status::text AS status, o.order_number, u.full_name AS rider
           FROM deliveries d LEFT JOIN orders o ON o.id = d.order_id
           LEFT JOIN users u ON u.id = d.rider_user_id WHERE d.id = $1`,
        [id],
      )
      return (
        d && {
          label: `Delivery for order ${d.order_number ?? '?'}`,
          detail: [d.status, d.rider && `rider ${d.rider}`].filter(Boolean).join(' · '),
          href: null,
        }
      )
    }
    case 'payment': {
      const p = await sql.one<{
        amount: number
        status: string
        method: string
        provider: string | null
        order_number: string | null
      }>(
        `SELECT p.amount, p.status::text AS status, p.method::text AS method, p.provider, o.order_number
           FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE p.id = $1`,
        [id],
      )
      return (
        p && {
          label: `Payment ${naira(p.amount)}${p.order_number ? ` for order ${p.order_number}` : ''}`,
          detail: [p.status, p.method.replace(/_/g, ' '), p.provider].filter(Boolean).join(' · '),
          href: null,
        }
      )
    }
    case 'payout': {
      const p = await sql.one<{
        amount: number
        status: string
        bank_name: string
        account_name: string
      }>(
        `SELECT amount, status::text AS status, bank_name, account_name FROM payouts WHERE id = $1`,
        [id],
      )
      return (
        p && {
          label: `Payout ${naira(p.amount)} to ${p.account_name}`,
          detail: [p.status, p.bank_name].filter(Boolean).join(' · '),
          href: null,
        }
      )
    }
    default:
      return null
  }
}
