import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { getSetting } from '@/modules/platform/service'
import { distanceKmSqlOn } from '@/lib/geo'
import {
  canTransitionEnquiry,
  canTransitionListing,
  LISTING_CAPABILITIES,
  REQUIREMENT_CAPABILITIES,
  type Capability,
  type EnquiryStatus,
  type ListingStatus,
} from '@/modules/circular/states'
import {
  convertQuantity,
  DEFAULT_MATCH_WEIGHTS,
  MATCH_WEIGHTS_SETTING,
  planSourcing,
  rankMatches,
  validateWeights,
  type Candidate,
  type Condition,
  type Match,
  type MatchWeights,
  type Requirement,
  type SourcingPlan,
  type Unit,
} from '@/modules/circular/matching'

/**
 * MODULE: circular - Phase 1 (foundation) and Phase 2 (discovery) services
 * (AfriMesh Circular spec §4, §5, §7, §13)
 *
 * Businesses are the platform's organisations; nothing here creates a second
 * kind of account (§4, §16). Every write takes the acting business from the
 * caller - which takes it from the session, never from a form - and every
 * listing change is scoped to that business in the query itself, so one
 * business cannot touch another's listing however the id is obtained (§13,
 * test 7).
 *
 * Built and tested, not reachable: /api/v1/circular answers 501 and no
 * screen calls these until CIRCULAR_LAUNCHED (src/lib/launch-circular.ts).
 */

export class CircularRuleError extends Error {}

// --- Capabilities (§4) ---------------------------------------------------------

/** Ask for a role. Starts PENDING; an administrator verifies it. */
export async function grantCapability(
  businessId: string,
  capability: Capability,
  actorUserId: string,
): Promise<void> {
  const sql = await getSql()
  const row = await sql.one<{ id: string }>(
    `INSERT INTO circular_business_capabilities (business_id, capability_type)
     VALUES ($1, $2) ON CONFLICT (business_id, capability_type) DO NOTHING RETURNING id`,
    [businessId, capability],
  )
  if (!row) return
  await publish({
    type: EVENT.CircularCapabilityGranted,
    aggregateType: 'organisation',
    aggregateId: businessId,
    actorUserId,
    payload: { capability },
  })
}

export async function setCapabilityVerification(
  businessId: string,
  capability: Capability,
  status: 'VERIFIED' | 'REJECTED',
): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `UPDATE circular_business_capabilities SET verification_status = $3
      WHERE business_id = $1 AND capability_type = $2`,
    [businessId, capability, status],
  )
}

/**
 * Test 1: "A verified business can create a recyclable material listing."
 * Both halves are checked: the business is verified on the platform, and it
 * holds a verified Circular role that allows the action.
 */
async function assertMayAct(db: Sql, businessId: string, allowed: readonly Capability[]) {
  const row = await db.one<{ verification: string; status: string; roles: number }>(
    `SELECT o.verification, o.status,
            (SELECT COUNT(*)::int FROM circular_business_capabilities c
              WHERE c.business_id = o.id AND c.verification_status = 'VERIFIED'
                AND c.capability_type = ANY($2::text[])) AS roles
       FROM organisations o WHERE o.id = $1`,
    [businessId, allowed],
  )
  if (!row) throw new CircularRuleError('Business not found.')
  if (row.status !== 'active' || row.verification !== 'verified') {
    throw new CircularRuleError('Only a verified, active business can do this.')
  }
  if (row.roles === 0) {
    throw new CircularRuleError('This business does not hold a verified Circular role for that.')
  }
}

// --- Listings (§5.2) -------------------------------------------------------------

export interface ListingInput {
  resourceId: string
  materialName: string
  description?: string | null
  listingType?: 'SURPLUS' | 'RECYCLABLE' | 'REUSABLE' | 'BY_PRODUCT'
  quantity: number
  unit: Unit
  minimumQuantity?: number | null
  condition: Condition
  /** This lot's measured specifications, e.g. { grade: 'A' }. */
  specifications?: Record<string, string | number | boolean>
  priceType: 'FIXED' | 'NEGOTIABLE' | 'FREE'
  /** Per unit, kobo. */
  pricePerUnit?: number | null
  collectionPreference?: 'SELLER_DELIVERS' | 'BUYER_COLLECTS' | 'THIRD_PARTY' | 'EITHER'
  /** Defaults to the business's own location. */
  location?: { lat: number; lng: number } | null
  expiresAt?: Date | null
}

/** Created as DRAFT; publishing is its own step, through the availability machine. */
export async function createListing(
  businessId: string,
  actorUserId: string,
  input: ListingInput,
): Promise<{ id: string }> {
  if (!input.materialName.trim()) throw new CircularRuleError('Name the material.')
  if (!(input.quantity > 0)) throw new CircularRuleError('The quantity must be more than zero.')
  return withTx(async (tx) => {
    await assertMayAct(tx, businessId, LISTING_CAPABILITIES)
    const row = await tx.one<{ id: string }>(
      `INSERT INTO circular_listings
         (resource_id, business_id, created_by_user_id, listing_type, material_name, description,
          quantity_available, unit, minimum_quantity, condition, price_type, price_per_unit,
          collection_preference, lat, lng, expires_at, specifications)
       SELECT $1, o.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              COALESCE($14, o.lat), COALESCE($15, o.lng), $16, $17
         FROM organisations o WHERE o.id = $2
       RETURNING id`,
      [
        input.resourceId,
        businessId,
        actorUserId,
        input.listingType ?? 'RECYCLABLE',
        input.materialName.trim(),
        input.description ?? null,
        input.quantity,
        input.unit,
        input.minimumQuantity ?? null,
        input.condition,
        input.priceType,
        input.priceType === 'FREE' ? null : (input.pricePerUnit ?? null),
        input.collectionPreference ?? 'EITHER',
        input.location?.lat ?? null,
        input.location?.lng ?? null,
        input.expiresAt ?? null,
        JSON.stringify(input.specifications ?? {}),
      ],
    )
    return row!
  })
}

/**
 * Move a listing through its availability machine. Scoped to the owning
 * business in the WHERE clause: another business's id matches nothing.
 */
export async function setListingAvailability(
  businessId: string,
  listingId: string,
  to: ListingStatus,
  actorUserId: string,
): Promise<void> {
  await withTx(async (tx) => {
    const current = await tx.one<{ availability_status: ListingStatus }>(
      `SELECT availability_status FROM circular_listings
        WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [listingId, businessId],
    )
    if (!current) throw new CircularRuleError('That listing was not found.')
    if (!canTransitionListing(current.availability_status, to)) {
      throw new CircularRuleError(`A listing cannot move from ${current.availability_status} to ${to}.`)
    }
    if (to === 'AVAILABLE') await assertMayAct(tx, businessId, LISTING_CAPABILITIES)
    await tx.query(
      `UPDATE circular_listings
          SET availability_status = $3,
              published_at = CASE WHEN $3 = 'AVAILABLE' THEN COALESCE(published_at, now()) ELSE published_at END,
              updated_at = now()
        WHERE id = $1 AND business_id = $2`,
      [listingId, businessId, to],
    )
    await publish(
      {
        type: to === 'AVAILABLE' ? EVENT.CircularListingPublished : EVENT.CircularListingStatusChanged,
        aggregateType: 'circular_listing',
        aggregateId: listingId,
        actorUserId,
        payload: { businessId, from: current.availability_status, to },
      },
      tx,
    )
  })
}

/**
 * Test 12: "Simultaneous reservations cannot cause the same available
 * material quantity to be oversold." The check and the deduction are one
 * conditional UPDATE - the same guard Commerce uses for stock - so two
 * buyers racing for the last tonne cannot both win: one matches no row.
 * A listing that reaches zero leaves discovery in the same statement.
 *
 * Phase 4 calls this when a transaction is created from an agreed enquiry.
 */
export async function reserveListingQuantity(
  listingId: string,
  quantity: number,
  unit: Unit,
  tx?: Sql,
): Promise<{ remaining: number; exhausted: boolean }> {
  const run = async (db: Sql) => {
    const listing = await db.one<{ unit: Unit }>(`SELECT unit FROM circular_listings WHERE id = $1`, [listingId])
    if (!listing) throw new CircularRuleError('That listing was not found.')
    const qty = convertQuantity(quantity, unit, listing.unit)
    if (qty === null) throw new CircularRuleError(`A ${listing.unit} listing cannot be reserved in ${unit}.`)
    if (!(qty > 0)) throw new CircularRuleError('Reserve more than zero.')
    const row = await db.one<{ quantity_available: number; availability_status: ListingStatus }>(
      `UPDATE circular_listings
          SET quantity_available = quantity_available - $2,
              availability_status = CASE WHEN quantity_available - $2 = 0 THEN 'EXHAUSTED' ELSE availability_status END,
              updated_at = now()
        WHERE id = $1 AND availability_status = 'AVAILABLE' AND quantity_available >= $2
        RETURNING quantity_available, availability_status`,
      [listingId, qty],
    )
    if (!row) throw new CircularRuleError('Not enough of that material is available any more.')
    await publish(
      {
        type: EVENT.CircularQuantityReserved,
        aggregateType: 'circular_listing',
        aggregateId: listingId,
        payload: { quantity: qty, unit: listing.unit, remaining: Number(row.quantity_available) },
      },
      db,
    )
    return { remaining: Number(row.quantity_available), exhausted: row.availability_status === 'EXHAUSTED' }
  }
  return tx ? run(tx) : withTx(run)
}

// --- Requirements and discovery (§7) -------------------------------------------

export interface RequirementInput {
  resourceId: string
  quantity: number
  unit: Unit
  minimumQuality?: Condition
  location?: { lat: number; lng: number } | null
  maximumDistanceKm?: number | null
  maximumPrice?: number | null
  acceptsPartial?: boolean
}

export async function postRequirement(
  businessId: string,
  actorUserId: string,
  input: RequirementInput,
): Promise<{ id: string }> {
  if (!(input.quantity > 0)) throw new CircularRuleError('The quantity must be more than zero.')
  return withTx(async (tx) => {
    await assertMayAct(tx, businessId, REQUIREMENT_CAPABILITIES)
    const row = await tx.one<{ id: string }>(
      `INSERT INTO circular_requirements
         (business_id, created_by_user_id, resource_id, required_quantity, unit, minimum_quality,
          preferred_lat, preferred_lng, maximum_distance_km, maximum_price, accepts_partial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        businessId,
        actorUserId,
        input.resourceId,
        input.quantity,
        input.unit,
        input.minimumQuality ?? 'MIXED',
        input.location?.lat ?? null,
        input.location?.lng ?? null,
        input.maximumDistanceKm ?? null,
        input.maximumPrice ?? null,
        input.acceptsPartial ?? false,
      ],
    )
    await publish(
      {
        type: EVENT.CircularRequirementPosted,
        aggregateType: 'circular_requirement',
        aggregateId: row!.id,
        actorUserId,
        payload: { businessId, resourceId: input.resourceId, quantity: input.quantity, unit: input.unit },
      },
      tx,
    )
    return row!
  })
}

/** The configured weights (§7.3), or the specification's defaults. */
export async function matchWeights(): Promise<MatchWeights> {
  const stored = await getSetting<MatchWeights>(MATCH_WEIGHTS_SETTING, DEFAULT_MATCH_WEIGHTS)
  return validateWeights({ ...DEFAULT_MATCH_WEIGHTS, ...stored })
}

/** How far the database pre-filter reaches when a requirement sets no limit. */
const DISCOVERY_RADIUS_KM = 250

/**
 * §7.1: discover the listings that could serve a requirement, ranked, with a
 * sourcing plan. The business owning the requirement must be the caller.
 *
 * The database narrows candidates - live listings only (test 6), same
 * material or category, never the business's own, within the radius, using
 * the platform's distance formula - and the matching engine scores them.
 */
export async function discover(
  businessId: string,
  requirementId: string,
): Promise<{ matches: Match[]; plan: SourcingPlan }> {
  const sql = await getSql()
  const r = await sql.one<{
    resource_id: string
    category_id: string
    required_quantity: number
    unit: Unit
    minimum_quality: Condition
    lat: number
    lng: number
    maximum_distance_km: number | null
    maximum_price: number | null
    accepts_partial: boolean
  }>(
    `SELECT q.resource_id, res.category_id, q.required_quantity, q.unit, q.minimum_quality,
            COALESCE(q.preferred_lat, o.lat) AS lat, COALESCE(q.preferred_lng, o.lng) AS lng,
            q.maximum_distance_km, q.maximum_price, q.accepts_partial
       FROM circular_requirements q
       JOIN circular_resources res ON res.id = q.resource_id
       JOIN organisations o ON o.id = q.business_id
      WHERE q.id = $1 AND q.business_id = $2`,
    [requirementId, businessId],
  )
  if (!r) throw new CircularRuleError('That requirement was not found.')

  const radius = Number(r.maximum_distance_km ?? DISCOVERY_RADIUS_KM)
  const distance = distanceKmSqlOn('l.lat', 'l.lng', '$3', '$4')
  const rows = await sql.query<{
    id: string
    business_id: string
    verified: boolean
    resource_id: string
    category_id: string
    quantity_available: number
    unit: Unit
    minimum_quantity: number | null
    condition: Condition
    price_type: Candidate['priceType']
    price_per_unit: number | null
    lat: number
    lng: number
    specifications: Record<string, unknown>
  }>(
    `SELECT l.id, l.business_id, (o.verification = 'verified' AND o.status = 'active') AS verified,
            l.resource_id, res.category_id, l.quantity_available, l.unit, l.minimum_quantity,
            l.condition, l.price_type, l.price_per_unit, l.lat, l.lng, l.specifications
       FROM circular_listings l
       JOIN circular_resources res ON res.id = l.resource_id
       JOIN organisations o ON o.id = l.business_id
      WHERE l.availability_status = 'AVAILABLE'
        AND l.quantity_available > 0
        AND (l.expires_at IS NULL OR l.expires_at > now())
        AND l.business_id <> $1
        AND (l.resource_id = $2 OR res.category_id = $5)
        AND ${distance} <= $6
      LIMIT 500`,
    [businessId, r.resource_id, r.lat, r.lng, r.category_id, radius],
  )

  const requirement: Requirement = {
    resourceId: r.resource_id,
    categoryId: r.category_id,
    quantity: Number(r.required_quantity),
    unit: r.unit,
    minimumQuality: r.minimum_quality,
    location: { lat: Number(r.lat), lng: Number(r.lng) },
    maximumDistanceKm: r.maximum_distance_km === null ? null : Number(r.maximum_distance_km),
    maximumPrice: r.maximum_price === null ? null : Number(r.maximum_price),
    acceptsPartial: r.accepts_partial,
  }
  const candidates: Candidate[] = rows.map((l) => ({
    listingId: l.id,
    businessId: l.business_id,
    businessVerified: l.verified,
    resourceId: l.resource_id,
    categoryId: l.category_id,
    quantityAvailable: Number(l.quantity_available),
    unit: l.unit,
    minimumQuantity: l.minimum_quantity === null ? null : Number(l.minimum_quantity),
    condition: l.condition,
    priceType: l.price_type,
    pricePerUnit: l.price_per_unit === null ? null : Number(l.price_per_unit),
    location: { lat: Number(l.lat), lng: Number(l.lng) },
    specifications: l.specifications ?? {},
  }))

  const matches = rankMatches(requirement, candidates, await matchWeights())
  return { matches, plan: planSourcing(requirement, matches) }
}

/** POST /matches: keep what discovery found, so a business can come back to it. */
export async function recordMatches(requirementId: string, matches: Match[]): Promise<void> {
  if (!matches.length) return
  await withTx(async (tx) => {
    for (const m of matches) {
      await tx.query(
        `INSERT INTO circular_matches (listing_id, requirement_id, distance_km, compatibility_score, fully_qualified)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (listing_id, requirement_id) DO UPDATE
           SET distance_km = EXCLUDED.distance_km,
               compatibility_score = EXCLUDED.compatibility_score,
               fully_qualified = EXCLUDED.fully_qualified`,
        [m.listingId, requirementId, m.distanceKm, m.score, m.fullyQualified],
      )
    }
    await tx.query(`UPDATE circular_requirements SET status = 'MATCHED' WHERE id = $1 AND status = 'OPEN'`, [
      requirementId,
    ])
  })
}

// --- Enquiries (Phase 3 entry point) ------------------------------------------

/**
 * Test 8: "A buyer can submit an enquiry without automatically creating a
 * completed transaction." An enquiry is a message and a proposed quantity;
 * nothing is reserved and no money is involved until a transaction is
 * created from an agreed enquiry in Phase 4.
 */
export async function sendEnquiry(
  businessId: string,
  actorUserId: string,
  input: { listingId: string; quantity: number; proposedPrice?: number | null; message?: string | null },
): Promise<{ id: string }> {
  if (!(input.quantity > 0)) throw new CircularRuleError('Ask for more than zero.')
  return withTx(async (tx) => {
    await assertMayAct(tx, businessId, REQUIREMENT_CAPABILITIES)
    const listing = await tx.one<{ business_id: string; availability_status: ListingStatus }>(
      `SELECT business_id, availability_status FROM circular_listings WHERE id = $1`,
      [input.listingId],
    )
    if (!listing || listing.availability_status !== 'AVAILABLE') {
      throw new CircularRuleError('That listing is not available.')
    }
    if (listing.business_id === businessId) throw new CircularRuleError('A business cannot enquire about its own listing.')
    const row = await tx.one<{ id: string }>(
      `INSERT INTO circular_enquiries
         (listing_id, requesting_business_id, requested_by_user_id, requested_quantity, proposed_price, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.listingId, businessId, actorUserId, input.quantity, input.proposedPrice ?? null, input.message ?? null],
    )
    await publish(
      {
        type: EVENT.CircularEnquirySent,
        aggregateType: 'circular_enquiry',
        aggregateId: row!.id,
        actorUserId,
        payload: { listingId: input.listingId, businessId, quantity: input.quantity },
      },
      tx,
    )
    return row!
  })
}

/** Either party moves an enquiry on; only the two businesses involved may. */
export async function setEnquiryStatus(
  businessId: string,
  enquiryId: string,
  to: EnquiryStatus,
): Promise<void> {
  await withTx(async (tx) => {
    const e = await tx.one<{ enquiry_status: EnquiryStatus }>(
      `SELECT e.enquiry_status FROM circular_enquiries e
         JOIN circular_listings l ON l.id = e.listing_id
        WHERE e.id = $1 AND (e.requesting_business_id = $2 OR l.business_id = $2) FOR UPDATE OF e`,
      [enquiryId, businessId],
    )
    if (!e) throw new CircularRuleError('That enquiry was not found.')
    if (!canTransitionEnquiry(e.enquiry_status, to)) {
      throw new CircularRuleError(`An enquiry cannot move from ${e.enquiry_status} to ${to}.`)
    }
    await tx.query(`UPDATE circular_enquiries SET enquiry_status = $2, updated_at = now() WHERE id = $1`, [
      enquiryId,
      to,
    ])
  })
}
