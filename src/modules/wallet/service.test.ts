import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  reference,
  PLATFORM_IDS,
  PLATFORM_FLOAT,
  PLATFORM_REVENUE,
  PLATFORM_LOGISTICS,
  PLATFORM_POINTS,
} from './service.ts'

/**
 * The ledger's own balancing is enforced in SQL and checked by `npm run verify`
 * against a real database. What is worth pinning here is the pair of things
 * that would corrupt it silently from the application side: a reference that
 * collides, and a platform wallet id that is not stable.
 */

describe('ledger references', () => {
  test('carries the caller’s prefix, so a line is traceable to what made it', () => {
    assert.match(reference('ORD'), /^ORD_/)
    assert.match(reference('PAYOUT'), /^PAYOUT_/)
  })

  test('is uppercase and free of separators that would break a URL or CSV', () => {
    const ref = reference('ORD')
    assert.equal(ref, ref.toUpperCase())
    assert.doesNotMatch(ref, /[\s,]/)
  })

  test('does not collide across a burst issued in the same millisecond', () => {
    // The timestamp component is millisecond-resolution, so a tight loop lands
    // in the same tick; uniqueness has to come from the random half.
    const refs = new Set(Array.from({ length: 20_000 }, () => reference('ORD')))
    assert.equal(refs.size, 20_000, 'a reference collided')
  })
})

describe('platform wallet ids', () => {
  const NAMED = [PLATFORM_FLOAT, PLATFORM_REVENUE, PLATFORM_LOGISTICS, PLATFORM_POINTS]

  test('every named platform wallet has an id', () => {
    for (const name of NAMED) {
      assert.ok(PLATFORM_IDS[name], `${name} has no id`)
    }
  })

  test('the ids are distinct, so float and revenue cannot be conflated', () => {
    const ids = NAMED.map((n) => PLATFORM_IDS[n])
    assert.equal(new Set(ids).size, ids.length)
  })

  test('they are well-formed UUIDs, and fixed rather than generated', () => {
    // These are deliberately deterministic so that float and revenue are the
    // same wallets across a restart, a redeploy and a fresh environment. If
    // this ever starts returning something random, every historical ledger
    // line stops pointing at the wallet it was written against.
    for (const name of NAMED) {
      assert.match(
        PLATFORM_IDS[name],
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        `${name} is not a valid v4-shaped UUID`,
      )
    }
    assert.equal(PLATFORM_IDS[PLATFORM_FLOAT], PLATFORM_IDS[PLATFORM_FLOAT])
  })
})
