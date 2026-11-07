/**
 * MODULE: circular - state machines (AfriMesh Circular spec §9, §13)
 *
 * "Circular discovery and Circular transactions must be separate operational
 * stages. A user discovering a resource does not automatically initiate a
 * financial transaction." So there are three machines, and none of them can
 * reach into another: a listing's availability, an enquiry's negotiation,
 * and a transaction's settlement. An agreed enquiry is what a transaction is
 * created from - by an explicit step, never by the enquiry moving on.
 *
 * Every permitted move is listed; anything else is refused. The database
 * CHECK constraints in src/db/circular.sql hold the same value sets.
 *
 * Dormant with the rest of Circular: see src/lib/launch-circular.ts.
 */

// --- Listing availability -----------------------------------------------------

export const LISTING_STATUSES = ['DRAFT', 'AVAILABLE', 'EXHAUSTED', 'WITHDRAWN', 'EXPIRED'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

/**
 * A listing goes live, then leaves discovery when it runs out, is withdrawn
 * or expires (§13 "must not remain available for matching after they have
 * been exhausted, withdrawn or expired"). An exhausted or expired listing can
 * be relisted - a generator's scrap comes back every month - but a withdrawn
 * one is the business's decision to stop, so it goes back to DRAFT first.
 */
const LISTING_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  DRAFT: ['AVAILABLE', 'WITHDRAWN'],
  AVAILABLE: ['EXHAUSTED', 'WITHDRAWN', 'EXPIRED'],
  EXHAUSTED: ['AVAILABLE', 'WITHDRAWN'],
  EXPIRED: ['AVAILABLE', 'WITHDRAWN'],
  WITHDRAWN: ['DRAFT'],
}

export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return LISTING_TRANSITIONS[from].includes(to)
}

/**
 * Whether a listing may appear in discovery right now (test 6). The status
 * alone is not enough: an AVAILABLE listing past its expiry, or one with
 * nothing left, is out even before a sweep has moved its status.
 */
export function isDiscoverable(
  listing: { availability_status: ListingStatus; quantity_available: number; expires_at: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (listing.availability_status !== 'AVAILABLE') return false
  if (!(Number(listing.quantity_available) > 0)) return false
  if (listing.expires_at && new Date(listing.expires_at) <= now) return false
  return true
}

// --- Enquiry / negotiation (discovery stage) --------------------------------

export const ENQUIRY_STATUSES = ['OPEN', 'NEGOTIATING', 'AGREED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'] as const
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number]

const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  OPEN: ['NEGOTIATING', 'AGREED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'],
  NEGOTIATING: ['AGREED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'],
  // Agreement reached ends the discovery stage. What happens next is a
  // transaction, created on purpose - the enquiry itself goes nowhere.
  AGREED: [],
  DECLINED: [],
  WITHDRAWN: [],
  EXPIRED: [],
}

export function canTransitionEnquiry(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return ENQUIRY_TRANSITIONS[from].includes(to)
}

// --- Transaction (commercial stage) -----------------------------------------

export const TRANSACTION_STATUSES = [
  'CREATED',
  'PAYMENT_INITIATED',
  'PAYMENT_VERIFIED',
  'LOGISTICS_ARRANGED',
  'MATERIAL_HANDED_OVER',
  'COMPLETION_CONFIRMED',
  'CLOSED',
  'CANCELLED',
  'DISPUTED',
  'FAILED',
  'REFUNDED',
  'EXPIRED',
] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export type PaymentBasis = 'ONLINE' | 'OFFLINE_DECLARED' | 'NO_CHARGE'

/**
 * §9: AGREEMENT CONFIRMED → TRANSACTION CREATED → PAYMENT INITIATED → PAYMENT
 * VERIFIED → LOGISTICS ARRANGED → MATERIAL HANDOVER → COMPLETION CONFIRMED →
 * TRANSACTION CLOSED, with payment and logistics "where applicable".
 *
 * So an online deal must pass through payment; an offline or free one may go
 * straight to logistics or handover. Logistics is optional for everyone (the
 * buyer may collect). Disputes can be raised at any point after creation and
 * end refunded or closed.
 */
const TRANSACTION_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  CREATED: ['PAYMENT_INITIATED', 'LOGISTICS_ARRANGED', 'MATERIAL_HANDED_OVER', 'CANCELLED', 'EXPIRED'],
  PAYMENT_INITIATED: ['PAYMENT_VERIFIED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PAYMENT_VERIFIED: ['LOGISTICS_ARRANGED', 'MATERIAL_HANDED_OVER', 'DISPUTED', 'REFUNDED'],
  LOGISTICS_ARRANGED: ['MATERIAL_HANDED_OVER', 'DISPUTED', 'CANCELLED'],
  MATERIAL_HANDED_OVER: ['COMPLETION_CONFIRMED', 'DISPUTED'],
  COMPLETION_CONFIRMED: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['REFUNDED', 'CLOSED'],
  FAILED: ['PAYMENT_INITIATED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
  REFUNDED: [],
  EXPIRED: [],
}

export interface TransitionContext {
  basis: PaymentBasis
  /**
   * AfriMesh Pay says the linked payment succeeded for the agreed amount -
   * from the payment record or its verified webhook, never from a frontend
   * (§9 "A payment must never be considered successful based solely on a
   * frontend response"). The database trigger checks the same thing.
   */
  paymentVerified?: boolean
}

export function canTransitionTransaction(
  from: TransactionStatus,
  to: TransactionStatus,
  context: TransitionContext,
): boolean {
  if (!TRANSACTION_TRANSITIONS[from].includes(to)) return false
  // An online deal cannot skip payment.
  if (context.basis === 'ONLINE' && from === 'CREATED' && to !== 'PAYMENT_INITIATED') {
    return to === 'CANCELLED' || to === 'EXPIRED'
  }
  // Offline and free deals never pass through AfriMesh Pay.
  if (context.basis !== 'ONLINE' && (to === 'PAYMENT_INITIATED' || to === 'PAYMENT_VERIFIED')) {
    return false
  }
  // Test 9: no payment confirmation without authoritative verification.
  if (to === 'PAYMENT_VERIFIED' && !context.paymentVerified) return false
  return true
}

// --- Business capabilities (§4) ---------------------------------------------

export const CAPABILITIES = [
  'RESOURCE_GENERATOR',
  'RECYCLER',
  'RESOURCE_AGGREGATOR',
  'MATERIAL_PROCESSOR',
  'RESOURCE_BUYER',
] as const
export type Capability = (typeof CAPABILITIES)[number]

/** Who may list materials: those who produce or hold them. */
export const LISTING_CAPABILITIES: readonly Capability[] = [
  'RESOURCE_GENERATOR',
  'RECYCLER',
  'RESOURCE_AGGREGATOR',
]

/** Who may post a requirement: those who take materials in. */
export const REQUIREMENT_CAPABILITIES: readonly Capability[] = [
  'RECYCLER',
  'RESOURCE_AGGREGATOR',
  'MATERIAL_PROCESSOR',
  'RESOURCE_BUYER',
]
