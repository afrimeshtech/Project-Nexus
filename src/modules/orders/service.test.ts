import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { deliveryFeeFor, ORDER_STATUS_LABEL, type OrderStatus } from './service.ts'
import { formatMoney } from '@/lib/money'

/**
 * Delivery pricing is charged to a real buyer on every delivered order, so it
 * is worth pinning: a sign error or a unit slip here is money, in both
 * directions. Everything asserted below is in minor units (kobo).
 */
describe('delivery pricing', () => {
  test('collection is free, however far away the shop is', () => {
    for (const km of [0, 1, 12.5, 400]) {
      assert.equal(deliveryFeeFor(km, 'pickup'), 0)
    }
  })

  test('a delivery at the door still pays the dispatch fee', () => {
    // The rider is dispatched whether the distance is 0 km or 5 km.
    assert.equal(deliveryFeeFor(0, 'delivery'), 30_000)
  })

  test('adds ₦120 per kilometre on top of the ₦300 dispatch fee', () => {
    assert.equal(deliveryFeeFor(1, 'delivery'), 30_000 + 12_000)
    assert.equal(deliveryFeeFor(10, 'delivery'), 30_000 + 120_000)
  })

  test('never returns a fraction of a kobo', () => {
    // 2.7 km is 32,400.000000000004 before rounding in IEEE 754.
    for (const km of [0.1, 2.7, 3.3, 7.77, 12.345]) {
      const fee = deliveryFeeFor(km, 'delivery')
      assert.equal(fee, Math.round(fee), `${km} km produced a fractional fee`)
      assert.ok(Number.isSafeInteger(fee))
    }
  })

  test('rises with distance and never falls', () => {
    let previous = -1
    for (let km = 0; km <= 50; km += 0.5) {
      const fee = deliveryFeeFor(km, 'delivery')
      assert.ok(fee >= previous, `fee dropped between ${km - 0.5} and ${km} km`)
      previous = fee
    }
  })

  test('a fee always renders as a clean naira figure', () => {
    assert.equal(formatMoney(deliveryFeeFor(0, 'delivery')), '₦300')
    assert.equal(formatMoney(deliveryFeeFor(10, 'delivery')), '₦1,500')
  })
})

describe('order status', () => {
  const ALL: OrderStatus[] = [
    'pending_payment',
    'confirmed',
    'preparing',
    'dispatched',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
  ]

  test('every status a buyer can land on has plain-language wording', () => {
    for (const status of ALL) {
      const label = ORDER_STATUS_LABEL[status]
      assert.ok(label, `${status} has no label`)
      assert.ok(!label.includes('_'), `${status} leaks the enum name to the buyer`)
      assert.equal(label, label.trim())
    }
  })

  test('no two statuses share a label, so the buyer can tell them apart', () => {
    const labels = ALL.map((s) => ORDER_STATUS_LABEL[s])
    assert.equal(new Set(labels).size, labels.length)
  })
})
