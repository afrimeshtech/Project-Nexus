import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The webhook's signature check, verified in isolation.
 *
 * The route itself cannot be imported here without pulling in the database and
 * the whole orders module, so the check is reproduced exactly as route.ts
 * implements it and tested against the cases that matter. If one changes, this
 * file has to change with it — that is the point: this is the boundary between
 * "Paystack told us" and "someone told us", and it is the only thing standing
 * between a stranger's POST and a confirmed order.
 */
function verifySignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret).update(raw, 'utf8').digest('hex')
  if (signature.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}

const SECRET = 'sk_test_notreal'
const BODY = JSON.stringify({
  event: 'charge.success',
  data: { id: 1234567, reference: 'f0b1a0a0-0000-4000-8000-000000000001', amount: 250_000 },
})

function sign(body: string, secret = SECRET): string {
  return createHmac('sha512', secret).update(body, 'utf8').digest('hex')
}

describe('paystack webhook signatures', () => {
  test('accepts a body signed with our secret', () => {
    assert.equal(verifySignature(BODY, sign(BODY), SECRET), true)
  })

  test('rejects a missing signature', () => {
    assert.equal(verifySignature(BODY, null, SECRET), false)
  })

  test('rejects a signature made with a different secret', () => {
    assert.equal(verifySignature(BODY, sign(BODY, 'sk_test_someoneelse'), SECRET), false)
  })

  test('rejects a body altered after signing', () => {
    // The attack this exists for: take a real charge.success for a ₦100 order
    // and reuse its signature against a ₦1,000,000 one.
    const signature = sign(BODY)
    const tampered = BODY.replace('250000', '100000000')
    assert.notEqual(tampered, BODY)
    assert.equal(verifySignature(tampered, signature, SECRET), false)
  })

  test('rejects a truncated or padded signature without throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the length is checked
    // first. A throw here would become a 500, and a 500 makes Paystack retry
    // a request we have already decided is forged.
    const signature = sign(BODY)
    for (const bad of [signature.slice(0, -1), signature + '0', '', 'not-hex']) {
      assert.doesNotThrow(() => verifySignature(BODY, bad, SECRET))
      assert.equal(verifySignature(BODY, bad, SECRET), false)
    }
  })

  test('is sensitive to whitespace, so the raw body must not be re-serialised', () => {
    // JSON.parse + JSON.stringify is not byte-identical to what was sent, and
    // signing the round-trip would reject every genuine webhook.
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2)
    assert.equal(verifySignature(reserialised, sign(BODY), SECRET), false)
  })
})
