import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  canTransitionEnquiry,
  canTransitionListing,
  canTransitionTransaction,
  isDiscoverable,
  LISTING_CAPABILITIES,
  REQUIREMENT_CAPABILITIES,
} from './states.ts'

/**
 * AfriMesh Circular §9 and §13: discovery and settlement are separate
 * stages, and nothing reaches "paid" without AfriMesh Pay saying so.
 */
describe('listing availability', () => {
  const now = new Date('2026-11-07T12:00:00Z')
  const live = { availability_status: 'AVAILABLE' as const, quantity_available: 5, expires_at: null }

  test('a live listing with stock and no expiry is discoverable', () => {
    assert.ok(isDiscoverable(live, now))
  })

  test('withdrawn, expired or exhausted listings are excluded (test 6)', () => {
    assert.ok(!isDiscoverable({ ...live, availability_status: 'WITHDRAWN' }, now))
    assert.ok(!isDiscoverable({ ...live, availability_status: 'EXPIRED' }, now))
    assert.ok(!isDiscoverable({ ...live, availability_status: 'EXHAUSTED' }, now))
    assert.ok(!isDiscoverable({ ...live, quantity_available: 0 }, now))
    // Past its expiry even before anything has moved its status.
    assert.ok(!isDiscoverable({ ...live, expires_at: '2026-11-07T11:59:59Z' }, now))
    assert.ok(!isDiscoverable({ ...live, availability_status: 'DRAFT' }, now))
  })

  test('an exhausted or expired listing can be relisted; a withdrawn one goes back to draft', () => {
    assert.ok(canTransitionListing('EXHAUSTED', 'AVAILABLE'))
    assert.ok(canTransitionListing('EXPIRED', 'AVAILABLE'))
    assert.ok(!canTransitionListing('WITHDRAWN', 'AVAILABLE'))
    assert.ok(canTransitionListing('WITHDRAWN', 'DRAFT'))
  })
})

describe('enquiries', () => {
  test('an agreed enquiry ends discovery and becomes nothing by itself (test 8)', () => {
    for (const to of ['OPEN', 'NEGOTIATING', 'DECLINED', 'WITHDRAWN', 'EXPIRED'] as const) {
      assert.ok(!canTransitionEnquiry('AGREED', to), `AGREED → ${to}`)
    }
  })

  test('negotiation can end in agreement or not', () => {
    assert.ok(canTransitionEnquiry('OPEN', 'NEGOTIATING'))
    assert.ok(canTransitionEnquiry('NEGOTIATING', 'AGREED'))
    assert.ok(canTransitionEnquiry('NEGOTIATING', 'DECLINED'))
  })
})

describe('transactions', () => {
  const online = { basis: 'ONLINE' as const }

  test('payment cannot be confirmed without authoritative verification (test 9)', () => {
    assert.ok(!canTransitionTransaction('PAYMENT_INITIATED', 'PAYMENT_VERIFIED', online))
    assert.ok(!canTransitionTransaction('PAYMENT_INITIATED', 'PAYMENT_VERIFIED', { ...online, paymentVerified: false }))
    assert.ok(canTransitionTransaction('PAYMENT_INITIATED', 'PAYMENT_VERIFIED', { ...online, paymentVerified: true }))
  })

  test('an online deal cannot skip payment', () => {
    assert.ok(!canTransitionTransaction('CREATED', 'MATERIAL_HANDED_OVER', online))
    assert.ok(!canTransitionTransaction('CREATED', 'LOGISTICS_ARRANGED', online))
    assert.ok(canTransitionTransaction('CREATED', 'PAYMENT_INITIATED', online))
    assert.ok(canTransitionTransaction('CREATED', 'CANCELLED', online))
  })

  test('an offline deal never claims an AfriMesh Pay payment (§10)', () => {
    const offline = { basis: 'OFFLINE_DECLARED' as const, paymentVerified: true }
    assert.ok(!canTransitionTransaction('CREATED', 'PAYMENT_INITIATED', offline))
    assert.ok(!canTransitionTransaction('PAYMENT_INITIATED', 'PAYMENT_VERIFIED', offline))
    assert.ok(canTransitionTransaction('CREATED', 'MATERIAL_HANDED_OVER', offline))
  })

  test('the full online path reaches CLOSED one step at a time', () => {
    const ctx = { basis: 'ONLINE' as const, paymentVerified: true }
    const path = [
      'CREATED',
      'PAYMENT_INITIATED',
      'PAYMENT_VERIFIED',
      'LOGISTICS_ARRANGED',
      'MATERIAL_HANDED_OVER',
      'COMPLETION_CONFIRMED',
      'CLOSED',
    ] as const
    for (let i = 0; i < path.length - 1; i++) {
      assert.ok(canTransitionTransaction(path[i]!, path[i + 1]!, ctx), `${path[i]} → ${path[i + 1]}`)
    }
  })

  test('closed, cancelled and refunded deals are final', () => {
    for (const from of ['CLOSED', 'CANCELLED', 'REFUNDED'] as const) {
      assert.ok(!canTransitionTransaction(from, 'CREATED', { basis: 'ONLINE', paymentVerified: true }))
    }
  })
})

describe('capabilities', () => {
  test('roles split into who lists materials and who takes them in (§4)', () => {
    assert.ok(LISTING_CAPABILITIES.includes('RESOURCE_GENERATOR'))
    assert.ok(!LISTING_CAPABILITIES.includes('RESOURCE_BUYER'))
    assert.ok(REQUIREMENT_CAPABILITIES.includes('MATERIAL_PROCESSOR'))
    // An aggregator does both - "a business may occupy multiple roles".
    assert.ok(LISTING_CAPABILITIES.includes('RESOURCE_AGGREGATOR'))
    assert.ok(REQUIREMENT_CAPABILITIES.includes('RESOURCE_AGGREGATOR'))
  })
})
