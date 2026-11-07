import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  convertQuantity,
  planSourcing,
  rankMatches,
  scoreCandidate,
  validateWeights,
  DEFAULT_MATCH_WEIGHTS,
  type Candidate,
  type Requirement,
} from './matching.ts'

/**
 * AfriMesh Circular §7: the matching engine decides which suppliers a
 * manufacturer is shown, so its rules are pinned down here.
 */
// A processor in Yola wants 2 tonnes of PET.
const yola = { lat: 9.2035, lng: 12.4954 }
const req: Requirement = {
  resourceId: 'pet',
  categoryId: 'plastics',
  quantity: 2,
  unit: 'tonne',
  minimumQuality: 'SORTED',
  location: yola,
  maximumDistanceKm: 50,
  maximumPrice: 200_000_00,
  acceptsPartial: false,
}

const base: Candidate = {
  listingId: 'near',
  businessId: 'b1',
  businessVerified: true,
  resourceId: 'pet',
  categoryId: 'plastics',
  quantityAvailable: 3000,
  unit: 'kg',
  minimumQuantity: null,
  condition: 'CLEAN_SORTED',
  priceType: 'FIXED',
  pricePerUnit: 150_00,
  location: { lat: 9.21, lng: 12.5 },
  specifications: {},
}

describe('units', () => {
  test('converts within a dimension, never across one', () => {
    assert.equal(convertQuantity(3000, 'kg', 'tonne'), 3)
    assert.equal(convertQuantity(2, 'cubic_metre', 'litre'), 2000)
    assert.equal(convertQuantity(5, 'kg', 'litre'), null)
    assert.equal(convertQuantity(5, 'bale', 'kg'), null)
  })
})

describe('scoring', () => {
  test('a nearby listing with enough clean stock is a fully qualified match (test 2)', () => {
    const m = scoreCandidate(req, base)
    assert.ok(m)
    assert.equal(m.fullyQualified, true)
    assert.equal(m.supplies, 3)
    assert.ok(m.score > 70, `score ${m.score}`)
  })

  test('nearer and more compatible ranks first (test 3)', () => {
    const far = { ...base, listingId: 'far', location: { lat: 9.45, lng: 12.6 } }
    const ranked = rankMatches(req, [far, base])
    assert.deepEqual(ranked.map((m) => m.listingId), ['near', 'far'])
    assert.ok(ranked[0]!.distanceKm < ranked[1]!.distanceKm)
  })

  test('not enough quantity is never a fully qualified match (test 4, §7.3)', () => {
    const small = scoreCandidate(req, { ...base, quantityAvailable: 500 })
    assert.ok(small)
    assert.equal(small.fullyQualified, false)
    assert.ok(small.shortfalls[0]!.includes('covers 0.5 of 2'))
  })

  test('failing a mandatory specification is never a fully qualified match', () => {
    const graded = { ...req, mandatorySpecifications: { grade: 'A' } }
    const m = scoreCandidate(graded, { ...base, specifications: { grade: 'B' } })
    assert.ok(m)
    assert.equal(m.fullyQualified, false)
  })

  test('outside the distance limit, below quality, unverified or another material: not offered', () => {
    assert.equal(scoreCandidate(req, { ...base, location: { lat: 10.5, lng: 12.5 } }), null)
    assert.equal(scoreCandidate(req, { ...base, condition: 'MIXED' }), null)
    assert.equal(scoreCandidate(req, { ...base, businessVerified: false }), null)
    assert.equal(scoreCandidate(req, { ...base, resourceId: 'copper', categoryId: 'metals' }), null)
  })

  test('a minimum order above the whole requirement cannot be bought from', () => {
    assert.equal(scoreCandidate(req, { ...base, minimumQuantity: 5000 }), null)
  })

  test('weights are configurable, and a nonsense setting is refused (§7.3)', () => {
    const proximityOnly = { material: 0, proximity: 1, quantity: 0, condition: 0, price: 0 }
    const near = scoreCandidate(req, base, proximityOnly)!
    assert.ok(near.score > 95, `score ${near.score}`)
    assert.throws(() => validateWeights({ ...DEFAULT_MATCH_WEIGHTS, price: -1 }))
    assert.throws(() => validateWeights({ material: 0, proximity: 0, quantity: 0, condition: 0, price: 0 }))
  })
})

describe('sourcing', () => {
  test('several partial listings can together meet a requirement (test 5)', () => {
    const partial = { ...req, acceptsPartial: true }
    const a = { ...base, listingId: 'a', quantityAvailable: 800 }
    const b = { ...base, listingId: 'b', quantityAvailable: 900, location: { lat: 9.22, lng: 12.51 } }
    const c = { ...base, listingId: 'c', quantityAvailable: 700, location: { lat: 9.25, lng: 12.52 } }
    const plan = planSourcing(partial, rankMatches(partial, [a, b, c]))
    assert.equal(plan.covers, true)
    assert.equal(plan.total, 2)
    assert.equal(plan.sources.reduce((s, x) => s + x.quantity, 0), 2)
  })

  test('a requirement larger than everything available is reported as not covered (test 4)', () => {
    const partial = { ...req, acceptsPartial: true, quantity: 10 }
    const plan = planSourcing(partial, rankMatches(partial, [base]))
    assert.equal(plan.covers, false)
    assert.equal(plan.total, 3)
  })

  test('without partial acceptance, only a single fully qualified listing will do', () => {
    const plan = planSourcing(req, rankMatches(req, [{ ...base, quantityAvailable: 1500 }]))
    assert.equal(plan.covers, false)
    assert.equal(plan.sources.length, 0)
  })
})
