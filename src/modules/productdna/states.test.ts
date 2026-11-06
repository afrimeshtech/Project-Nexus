import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  canReturnToSale,
  canTransitionIdentity,
  canTransitionLifecycle,
  mayRegisterProducts,
  DISPOSITIONS,
  type LifecycleStatus,
} from './states.ts'

/**
 * AFRI-PDNA-TIS-001 §10. The state machines decide what a unit may become;
 * an error here would let a sold or recalled unit be sold again.
 */
describe('identity state machine', () => {
  test('follows PENDING_REGISTRATION → REGISTERED → ACTIVE and no shortcut', () => {
    assert.ok(canTransitionIdentity('PENDING_REGISTRATION', 'REGISTERED'))
    assert.ok(canTransitionIdentity('REGISTERED', 'ACTIVE'))
    assert.ok(!canTransitionIdentity('PENDING_REGISTRATION', 'ACTIVE'))
  })

  test('an active identity can be suspended or revoked', () => {
    assert.ok(canTransitionIdentity('ACTIVE', 'SUSPENDED'))
    assert.ok(canTransitionIdentity('ACTIVE', 'REVOKED'))
  })

  test('a revoked identity can never become valid again', () => {
    for (const to of ['PENDING_REGISTRATION', 'REGISTERED', 'ACTIVE', 'SUSPENDED'] as const) {
      assert.ok(!canTransitionIdentity('REVOKED', to), `REVOKED → ${to} must be refused`)
    }
  })
})

describe('commercial lifecycle', () => {
  const path: LifecycleStatus[] = [
    'COMMISSIONED',
    'RELEASED',
    'IN_DISTRIBUTION',
    'RETAILER_INVENTORY',
    'AVAILABLE_FOR_SALE',
    'SOLD',
  ]

  test('walks the main path one step at a time', () => {
    for (let i = 0; i < path.length - 1; i++) {
      assert.ok(canTransitionLifecycle(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`)
    }
  })

  test('cannot skip ahead to SOLD', () => {
    assert.ok(!canTransitionLifecycle('IN_DISTRIBUTION', 'SOLD'))
    assert.ok(!canTransitionLifecycle('COMMISSIONED', 'SOLD'))
  })

  test('a sold unit cannot go straight back on sale (acceptance test 11)', () => {
    assert.ok(!canTransitionLifecycle('SOLD', 'AVAILABLE_FOR_SALE'))
    assert.ok(!canTransitionLifecycle('SOLD', 'RETAILER_INVENTORY'))
  })

  test('the return path reaches sale again only through inspection and acceptance', () => {
    const back: LifecycleStatus[] = [
      'SOLD',
      'RETURN_REQUESTED',
      'RETURN_INSPECTED',
      'RETURN_ACCEPTED',
      'RESALE_ELIGIBLE',
      'AVAILABLE_FOR_SALE',
    ]
    for (let i = 0; i < back.length - 1; i++) {
      assert.ok(canTransitionLifecycle(back[i]!, back[i + 1]!), `${back[i]} → ${back[i + 1]}`)
    }
    assert.ok(!canTransitionLifecycle('RETURN_REQUESTED', 'AVAILABLE_FOR_SALE'))
  })

  test('resale needs an authorised return, not just the move (§4.12, acceptance test 12)', () => {
    assert.ok(canReturnToSale({ from: 'RESALE_ELIGIBLE', resaleAuthorisation: 'AUTHORISED' }))
    assert.ok(!canReturnToSale({ from: 'RESALE_ELIGIBLE', resaleAuthorisation: 'PENDING' }))
    assert.ok(!canReturnToSale({ from: 'RETURN_ACCEPTED', resaleAuthorisation: 'AUTHORISED' }))
  })

  test('any unsold unit can take an alternative disposition', () => {
    for (const from of ['RELEASED', 'IN_DISTRIBUTION', 'AVAILABLE_FOR_SALE'] as const) {
      for (const to of DISPOSITIONS) {
        assert.ok(canTransitionLifecycle(from, to), `${from} → ${to}`)
      }
    }
  })

  test('a sold unit can only be recalled, not lost or quarantined from the shelf', () => {
    assert.ok(canTransitionLifecycle('SOLD', 'RECALLED'))
    assert.ok(!canTransitionLifecycle('SOLD', 'LOST'))
  })

  test('a destroyed unit goes nowhere', () => {
    for (const to of [...path, ...DISPOSITIONS]) {
      assert.ok(!canTransitionLifecycle('DESTROYED', to), `DESTROYED → ${to}`)
    }
  })
})

describe('manufacturer authority', () => {
  test('only a verified manufacturer registers products (acceptance tests 1 and 2)', () => {
    assert.ok(mayRegisterProducts('VERIFIED'))
    for (const status of ['PENDING', 'SUSPENDED', 'REJECTED'] as const) {
      assert.ok(!mayRegisterProducts(status), status)
    }
  })
})
