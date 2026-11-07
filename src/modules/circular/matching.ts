import { haversineKm } from '@/lib/geo'

/**
 * MODULE: circular - geospatial matching engine (AfriMesh Circular spec §7)
 *
 * "This is one of the most important components." Given a business's
 * material requirement and the live listings that could serve it, rank them
 * and say which genuinely qualify.
 *
 * Reuses the platform's geospatial code (lib/geo haversineKm) rather than a
 * second engine (§7.4). Pure functions: the database narrows candidates with
 * the same distance formula (lib/geo distanceKmSql), and this scores them.
 *
 * Dormant with the rest of Circular: see src/lib/launch-circular.ts.
 */

// --- Units (§5.2) --------------------------------------------------------------

export const UNITS = ['kg', 'tonne', 'litre', 'cubic_metre', 'unit', 'bale'] as const
export type Unit = (typeof UNITS)[number]

/**
 * Each unit in its base unit, by dimension. Mass and volume do not convert
 * into each other - that needs a density, which differs per material - and
 * counted units (a bale, a reusable door) do not convert at all.
 */
const BASE: Record<Unit, { dimension: 'mass' | 'volume' | 'count'; factor: number; base: Unit }> = {
  kg: { dimension: 'mass', factor: 1, base: 'kg' },
  tonne: { dimension: 'mass', factor: 1000, base: 'kg' },
  litre: { dimension: 'volume', factor: 1, base: 'litre' },
  cubic_metre: { dimension: 'volume', factor: 1000, base: 'litre' },
  unit: { dimension: 'count', factor: 1, base: 'unit' },
  bale: { dimension: 'count', factor: 1, base: 'bale' },
}

/** `quantity` in `from`, expressed in `to`; null when they do not convert. */
export function convertQuantity(quantity: number, from: Unit, to: Unit): number | null {
  if (from === to) return quantity
  const a = BASE[from]
  const b = BASE[to]
  if (a.dimension !== b.dimension || a.base !== b.base) return null
  return (quantity * a.factor) / b.factor
}

// --- Condition ---------------------------------------------------------------

export const CONDITIONS = ['CONTAMINATED', 'MIXED', 'SORTED', 'CLEAN_SORTED', 'NEW_SURPLUS'] as const
export type Condition = (typeof CONDITIONS)[number]

/** Worst (0) to best (4). */
const conditionRank = (c: Condition) => CONDITIONS.indexOf(c)

// --- Weights (§7.3) ------------------------------------------------------------

export interface MatchWeights {
  material: number
  proximity: number
  quantity: number
  condition: number
  price: number
}

/**
 * The specification's initial weighting. "These weights must be configurable
 * and not hardcoded permanently": the live values come from
 * platform_settings (key MATCH_WEIGHTS_SETTING), with these as the fallback.
 */
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  material: 30,
  proximity: 25,
  quantity: 20,
  condition: 15,
  price: 10,
}

export const MATCH_WEIGHTS_SETTING = 'circular.match_weights'

/** Reject a setting that would make the score meaningless, rather than score with it. */
export function validateWeights(w: MatchWeights): MatchWeights {
  const values = Object.values(w)
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
    throw new Error('Match weights must be non-negative numbers.')
  }
  if (values.reduce((a, b) => a + b, 0) <= 0) throw new Error('Match weights cannot all be zero.')
  return w
}

// --- Inputs ------------------------------------------------------------------

export interface Requirement {
  resourceId: string
  categoryId: string
  quantity: number
  unit: Unit
  minimumQuality: Condition
  location: { lat: number; lng: number }
  maximumDistanceKm: number | null
  /** Per-unit ceiling in kobo, in the requirement's unit. */
  maximumPrice: number | null
  acceptsPartial: boolean
  /** Specification values a listing must carry exactly, e.g. { grade: 'A' }. */
  mandatorySpecifications?: Record<string, string | number | boolean>
}

export interface Candidate {
  listingId: string
  businessId: string
  businessVerified: boolean
  resourceId: string
  categoryId: string
  quantityAvailable: number
  unit: Unit
  minimumQuantity: number | null
  condition: Condition
  priceType: 'FIXED' | 'NEGOTIABLE' | 'FREE'
  /** Per-unit price in kobo, in the listing's unit. */
  pricePerUnit: number | null
  location: { lat: number; lng: number }
  specifications: Record<string, unknown>
}

export interface Match {
  listingId: string
  distanceKm: number
  /** 0-100. */
  score: number
  /** Meets every mandatory condition and the whole quantity on its own (§7.3). */
  fullyQualified: boolean
  /** Quantity this listing could supply, in the requirement's unit. */
  supplies: number
  /** Why it is not fully qualified, for display and audit. */
  shortfalls: string[]
}

/** Beyond this, proximity scores zero when the requirement sets no limit. */
const REFERENCE_DISTANCE_KM = 100

/**
 * Score one candidate, or null when it cannot serve the requirement at all:
 * a different material, units that do not convert, outside the distance
 * limit, below the minimum quality, an unverified seller, or a minimum order
 * the requirement cannot reach.
 */
export function scoreCandidate(
  req: Requirement,
  c: Candidate,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): Match | null {
  // §7.2 business verification: an unverified seller is not offered at all.
  if (!c.businessVerified) return null

  const sameResource = c.resourceId === req.resourceId
  if (!sameResource && c.categoryId !== req.categoryId) return null

  const supplies = convertQuantity(c.quantityAvailable, c.unit, req.unit)
  if (supplies === null || supplies <= 0) return null

  // A listing whose minimum order is more than the whole requirement cannot be bought from.
  if (c.minimumQuantity !== null) {
    const minimum = convertQuantity(c.minimumQuantity, c.unit, req.unit)
    if (minimum !== null && minimum > req.quantity) return null
  }

  const distanceKm = haversineKm(req.location, c.location)
  if (req.maximumDistanceKm !== null && distanceKm > req.maximumDistanceKm) return null

  // Below the acceptable quality is a mandatory failure, not a low score.
  if (conditionRank(c.condition) < conditionRank(req.minimumQuality)) return null

  const shortfalls: string[] = []

  // "A listing that fails mandatory material specifications or has
  // insufficient available quantity must not be presented as a fully
  // qualified match."
  let specsMet = true
  for (const [key, want] of Object.entries(req.mandatorySpecifications ?? {})) {
    if (c.specifications[key] !== want) {
      specsMet = false
      shortfalls.push(`specification ${key} is not ${String(want)}`)
    }
  }
  if (supplies < req.quantity) {
    shortfalls.push(`covers ${round(supplies)} of ${round(req.quantity)} ${req.unit}`)
  }

  const material = !specsMet ? 0 : sameResource ? 1 : 0.6
  const reach = req.maximumDistanceKm ?? REFERENCE_DISTANCE_KM
  const proximity = Math.max(0, 1 - distanceKm / reach)
  const quantity = Math.min(1, supplies / req.quantity)
  const top = CONDITIONS.length - 1
  const condition = conditionRank(c.condition) / top
  const price = priceScore(req, c)

  validateWeights(weights)
  const total = weights.material + weights.proximity + weights.quantity + weights.condition + weights.price
  const score =
    (100 *
      (weights.material * material +
        weights.proximity * proximity +
        weights.quantity * quantity +
        weights.condition * condition +
        weights.price * price)) /
    total

  return {
    listingId: c.listingId,
    distanceKm: round(distanceKm),
    score: round(score),
    fullyQualified: specsMet && supplies >= req.quantity,
    supplies: round(supplies),
    shortfalls,
  }
}

/** Free is best; a negotiable price is unknown, so middling; a fixed one is judged against the budget. */
function priceScore(req: Requirement, c: Candidate): number {
  if (c.priceType === 'FREE') return 1
  if (c.priceType === 'NEGOTIABLE' || c.pricePerUnit === null) return 0.5
  if (req.maximumPrice === null) return 0.5
  // Per-unit prices compared in the requirement's unit.
  const perReqUnit = convertQuantity(1, req.unit, c.unit)
  if (perReqUnit === null) return 0
  const price = c.pricePerUnit * perReqUnit
  if (price > req.maximumPrice) return 0
  return req.maximumPrice === 0 ? 1 : 1 - 0.5 * (price / req.maximumPrice)
}

/**
 * §7.1 steps 5-9: score every candidate and rank. Fully qualified matches
 * come first; within each group, higher score, then nearer.
 */
export function rankMatches(
  req: Requirement,
  candidates: Candidate[],
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): Match[] {
  return candidates
    .map((c) => scoreCandidate(req, c, weights))
    .filter((m): m is Match => m !== null)
    .sort(
      (a, b) =>
        Number(b.fullyQualified) - Number(a.fullyQualified) ||
        b.score - a.score ||
        a.distanceKm - b.distanceKm,
    )
}

export interface SourcingPlan {
  /** Listings to buy from, best first, and how much from each. */
  sources: { listingId: string; quantity: number }[]
  total: number
  /** Whether the plan meets the whole requirement (test 4: never claimed when it does not). */
  covers: boolean
}

/**
 * Test 5, multi-source matching: when partial quantities are acceptable, take
 * the best-ranked listings in turn until the requirement is met. When they
 * are not, the plan is the single best fully qualified listing or nothing.
 */
export function planSourcing(req: Requirement, ranked: Match[]): SourcingPlan {
  if (!req.acceptsPartial) {
    const best = ranked.find((m) => m.fullyQualified)
    return best
      ? { sources: [{ listingId: best.listingId, quantity: req.quantity }], total: req.quantity, covers: true }
      : { sources: [], total: 0, covers: false }
  }
  const sources: SourcingPlan['sources'] = []
  let total = 0
  // Specification failures never count towards a plan, partial or not.
  for (const m of ranked.filter((r) => !r.shortfalls.some((s) => s.startsWith('specification')))) {
    if (total >= req.quantity) break
    const take = Math.min(m.supplies, req.quantity - total)
    sources.push({ listingId: m.listingId, quantity: round(take) })
    total += take
  }
  return { sources, total: round(total), covers: total >= req.quantity }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
