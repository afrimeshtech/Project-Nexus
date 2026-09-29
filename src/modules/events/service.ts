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
