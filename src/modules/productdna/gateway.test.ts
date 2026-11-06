import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { COMMERCE_EVENT_MAP, toProductDnaEvent, drainCommerceOutbox, type OutboxRow } from './gateway.ts'

/**
 * AFRI-PDNA-TIS-001 §9. The gateway's translation from Commerce events to the
 * ProductDNA envelope, and its dormancy.
 */
const sold: OutboxRow = {
  id: 4821,
  event_type: 'StockSold',
  aggregate_type: 'inventory_item',
  aggregate_id: '9d0fd4fb-b0c6-4c3d-a171-96767de05689',
  actor_user_id: null,
  payload: { qty: 2, orderId: '5e043df1-e332-4585-b41e-661434fb5858' },
  occurred_at: '2026-11-06T10:00:00.000Z',
}

describe('commerce event translation', () => {
  test('a Commerce sale becomes ProductSaleConfirmed with every §9 field', () => {
    const event = toProductDnaEvent(sold, 'product-123')
    assert.ok(event)
    assert.equal(event.event_type, 'ProductSaleConfirmed')
    assert.equal(event.event_id, '4821')
    assert.equal(event.source_system, 'AFRIMESH_COMMERCE')
    assert.equal(event.quantity, 2)
    assert.equal(event.external_reference, sold.payload.orderId)
    assert.equal(event.commerce_product_reference, 'product-123')
    assert.equal(event.occurred_at, '2026-11-06T10:00:00.000Z')
    for (const field of [
      'event_id', 'event_type', 'occurred_at', 'source_system', 'product_identity_id',
      'batch_id', 'product_serial_id', 'quantity', 'external_reference', 'actor_reference',
    ]) {
      assert.ok(field in event, `missing ${field}`)
    }
  })

  test('stock received and returns map to their ProductDNA types', () => {
    assert.equal(COMMERCE_EVENT_MAP.StockAdded, 'ProductStockReceived')
    assert.equal(COMMERCE_EVENT_MAP.StockReturned, 'ProductReturnAccepted')
  })

  test('events ProductDNA does not consume are ignored, not mistranslated', () => {
    for (const type of ['StockReserved', 'StockReleased', 'order.placed', 'user.logged_in']) {
      assert.equal(toProductDnaEvent({ ...sold, event_type: type }, null), null, type)
    }
  })

  test('no identity is claimed before the product is linked', () => {
    assert.equal(toProductDnaEvent(sold, null)?.product_identity_id, null)
  })
})

describe('dormant until launch', () => {
  test('the gateway refuses to run while PRODUCTDNA_LAUNCHED is false', async () => {
    await assert.rejects(drainCommerceOutbox(), /not launched/)
  })
})
