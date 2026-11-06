/**
 * MODULE: productdna - state machines (AFRI-PDNA-TIS-001 §10)
 *
 * Two machines, deliberately independent: a product's *identity* (is this a
 * genuine, registered product?) and its *commercial lifecycle* (where is this
 * unit now?). "A product can have a valid identity and an invalid commercial
 * disposition" - a genuine bottle that was recalled is still genuine.
 *
 * Every permitted move is listed. Anything not listed is refused, so a new
 * transition has to be added here on purpose, never inferred. The database
 * CHECK constraints in src/db/productdna.sql hold the same value sets.
 *
 * Dormant with the rest of ProductDNA: see src/lib/launch-productdna.ts.
 */

export const IDENTITY_STATUSES = [
  'PENDING_REGISTRATION',
  'REGISTERED',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
] as const
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number]

/**
 * PENDING_REGISTRATION → REGISTERED → ACTIVE; ACTIVE may be SUSPENDED or
 * REVOKED "under authorised procedures". A suspension can be lifted; a
 * revocation is final - a revoked identity is a counterfeit-risk signal (§12)
 * and must not quietly become valid again.
 */
const IDENTITY_TRANSITIONS: Record<IdentityStatus, readonly IdentityStatus[]> = {
  PENDING_REGISTRATION: ['REGISTERED'],
  REGISTERED: ['ACTIVE'],
  ACTIVE: ['SUSPENDED', 'REVOKED'],
  SUSPENDED: ['ACTIVE', 'REVOKED'],
  REVOKED: [],
}

export function canTransitionIdentity(from: IdentityStatus, to: IdentityStatus): boolean {
  return IDENTITY_TRANSITIONS[from].includes(to)
}

export const LIFECYCLE_STATUSES = [
  'COMMISSIONED',
  'RELEASED',
  'IN_DISTRIBUTION',
  'RETAILER_INVENTORY',
  'AVAILABLE_FOR_SALE',
  'SOLD',
  'RETURN_REQUESTED',
  'RETURN_INSPECTED',
  'RETURN_ACCEPTED',
  'RESALE_ELIGIBLE',
  // Alternative dispositions.
  'DAMAGED',
  'LOST',
  'DESTROYED',
  'RECALLED',
  'QUARANTINED',
  'EXPIRED',
] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

/** Where a unit can end up instead of being sold. */
export const DISPOSITIONS: readonly LifecycleStatus[] = [
  'DAMAGED',
  'LOST',
  'DESTROYED',
  'RECALLED',
  'QUARANTINED',
  'EXPIRED',
]

/** Physically gone for good: no move out of these. */
const TERMINAL: readonly LifecycleStatus[] = ['DESTROYED']

/**
 * The main path, then the return path back to sale. Any unit not yet sold
 * (and not terminal) can take an alternative disposition - a recall or a
 * quarantine applies wherever the unit is. A SOLD unit is with its buyer, so
 * only a recall reaches it there; everything else starts with a return.
 * QUARANTINED is the one disposition with a way back: an investigation can
 * clear a unit to where the gateway or an investigator decides it belongs.
 */
const LIFECYCLE_TRANSITIONS: Record<LifecycleStatus, readonly LifecycleStatus[]> = {
  COMMISSIONED: ['RELEASED'],
  RELEASED: ['IN_DISTRIBUTION'],
  IN_DISTRIBUTION: ['RETAILER_INVENTORY'],
  RETAILER_INVENTORY: ['AVAILABLE_FOR_SALE'],
  AVAILABLE_FOR_SALE: ['SOLD'],
  SOLD: ['RETURN_REQUESTED', 'RECALLED'],
  RETURN_REQUESTED: ['RETURN_INSPECTED'],
  RETURN_INSPECTED: ['RETURN_ACCEPTED', 'QUARANTINED', 'DAMAGED', 'DESTROYED'],
  RETURN_ACCEPTED: ['RESALE_ELIGIBLE'],
  RESALE_ELIGIBLE: ['AVAILABLE_FOR_SALE'],
  DAMAGED: ['DESTROYED'],
  LOST: [],
  DESTROYED: [],
  RECALLED: ['DESTROYED', 'QUARANTINED'],
  QUARANTINED: ['RETAILER_INVENTORY', 'AVAILABLE_FOR_SALE', 'RECALLED', 'DESTROYED'],
  EXPIRED: ['DESTROYED'],
}

const PRE_SALE: readonly LifecycleStatus[] = [
  'COMMISSIONED',
  'RELEASED',
  'IN_DISTRIBUTION',
  'RETAILER_INVENTORY',
  'AVAILABLE_FOR_SALE',
  'RESALE_ELIGIBLE',
]

export function canTransitionLifecycle(from: LifecycleStatus, to: LifecycleStatus): boolean {
  if (from === to) return false
  if (TERMINAL.includes(from)) return false
  if (LIFECYCLE_TRANSITIONS[from].includes(to)) return true
  // Not yet sold: any alternative disposition applies.
  return PRE_SALE.includes(from) && DISPOSITIONS.includes(to)
}

/**
 * "A returned product cannot become available for resale without an
 * authorised lifecycle transition" (§4.12). The path back to sale passes
 * through RETURN_ACCEPTED and RESALE_ELIGIBLE; this is the gate on the last
 * step, which needs the return's resale authorisation, not just the move.
 */
export function canReturnToSale(input: {
  from: LifecycleStatus
  resaleAuthorisation: 'PENDING' | 'AUTHORISED' | 'DENIED'
}): boolean {
  return input.from === 'RESALE_ELIGIBLE' && input.resaleAuthorisation === 'AUTHORISED'
}

export const MANUFACTURER_STATUSES = ['PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED'] as const
export type ManufacturerStatus = (typeof MANUFACTURER_STATUSES)[number]

/** "Unverified manufacturers cannot register authorised product identities" (acceptance test 1). */
export function mayRegisterProducts(status: ManufacturerStatus): boolean {
  return status === 'VERIFIED'
}
