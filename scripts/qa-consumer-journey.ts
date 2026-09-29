/**
 * End-to-end check of the consumer journey, through the same service calls
 * the server actions make:
 *
 *   register by email with a one-time code -> sign in by email code ->
 *   fund the wallet -> place and pay for an order -> track it ->
 *   seller prepares, dispatches, delivers -> buyer confirms receipt.
 *
 * Point it at a throwaway copy of the database - it creates real rows:
 *
 *   PGLITE_DIR=/tmp/qa-pgdata node --experimental-strip-types \
 *     --import ./scripts/register-alias.mjs scripts/qa-consumer-journey.ts
 *
 * Refuses to run against DATABASE_URL or the default ./.pgdata.
 */
import assert from 'node:assert/strict'
import { getSql, withTx } from '../src/db/client.ts'
import {
  assertContactAvailable,
  authenticateWithEmailOtp,
  registerUser,
  requestOtp,
  verifyOtp,
} from '../src/modules/identity/service.ts'
import { createPayment, gateway, markPayment } from '../src/modules/payments/service.ts'
import { deposit, getBalance } from '../src/modules/wallet/service.ts'
import {
  advanceOrder,
  getOrder,
  orderTimeline,
  ordersForBuyer,
  payOrder,
  placeOrder,
} from '../src/modules/orders/service.ts'
import { toMinor } from '../src/lib/money.ts'

if (process.env.DATABASE_URL || !process.env.PGLITE_DIR || process.env.PGLITE_DIR === '.pgdata') {
  console.error('! point PGLITE_DIR at a copy of the database; this script writes to it')
  process.exit(1)
}

let step = 0
async function check(name: string, fn: () => Promise<void>) {
  step++
  try {
    await fn()
    console.log(`ok ${step} - ${name}`)
  } catch (err) {
    console.log(`not ok ${step} - ${name}\n   ${(err as Error).message}`)
    process.exitCode = 1
    throw err
  }
}

async function main() {
  const sql = await getSql()
  const stamp = Date.now().toString(36)
  const email = `qa.shopper.${stamp}@example.ng`
  let userId = ''

  await check('email registration sends a code and holds no account yet', async () => {
    await assertContactAvailable({ email })
    const sent = await requestOtp(email, 'register')
    assert.ok(sent.devCode, 'a development code is returned in console mode')
    assert.equal(sent.destination, email)
    assert.equal(await verifyOtp(email, '000000', 'register'), false, 'a wrong code is refused')
    assert.equal(await verifyOtp(email, sent.devCode!, 'register'), true)
    const user = await registerUser({ fullName: 'QA Shopper', email, emailVerified: true })
    userId = user.id
    assert.equal(user.email_verified, true, 'the address is marked verified')
  })

  await check('the same email cannot register twice', async () => {
    await assert.rejects(assertContactAvailable({ email }), /already exists/)
  })

  await check('sign in with an email code', async () => {
    const sent = await requestOtp(email, 'login')
    const { user, created } = await authenticateWithEmailOtp(email, sent.devCode!)
    assert.equal(user.id, userId)
    assert.equal(created, false)
  })

  await check('an email with digits works end to end', async () => {
    const digits = `qa2.${stamp}@example.ng`
    const sent = await requestOtp(digits, 'login')
    assert.equal(sent.destination, digits)
    const { user, created } = await authenticateWithEmailOtp(digits, sent.devCode!)
    assert.equal(created, true)
    assert.equal(user.email, digits)
  })

  await check('fund the wallet with a ₦10,000 card top-up', async () => {
    const amount = toMinor(10_000)
    await withTx(async (tx) => {
      const payment = await createPayment(tx, {
        orderId: null,
        payerUserId: userId,
        method: 'card',
        amount,
        currency: 'NGN',
        creditOwner: { type: 'user', id: userId },
      })
      const charge = await gateway().charge({
        amount,
        currency: 'NGN',
        method: 'card',
        reference: payment.id,
        customer: { userId, email, phone: null },
        metadata: { purpose: 'wallet_topup', ownerType: 'user', ownerId: userId },
      })
      assert.equal(charge.status, 'succeeded', 'the mock gateway settles inline')
      await markPayment(tx, payment.id, 'succeeded', { providerRef: charge.providerRef })
      await deposit('user', userId, amount, 'Wallet top-up', tx)
    })
    const balance = await getBalance('user', userId)
    assert.equal(Number(balance.available), toMinor(10_000))
  })

  const shop = await sql.one<{ id: string; lat: number; lng: number; owner_user_id: string }>(
    `SELECT id, lat, lng, owner_user_id FROM organisations WHERE slug = 'grace-stores'`,
  )
  const item = await sql.one<{ id: string; qty_available: number }>(
    `SELECT i.id, i.qty_available FROM inventory_items i
       JOIN products p ON p.id = i.product_id
       JOIN categories c ON c.id = p.category_id
      WHERE i.organisation_id = $1 AND i.qty_available >= 2 AND i.is_listed
        AND i.retail_price BETWEEN 100 AND 400000 AND c.slug = 'groceries'
      ORDER BY i.retail_price ASC LIMIT 1`,
    [shop!.id],
  )
  assert.ok(shop && item, 'Grace Stores has a grocery item in stock')
  let orderId = ''

  await check('place a delivery order and pay from the wallet', async () => {
    const order = await placeOrder({
      buyerUserId: userId,
      buyerOrgId: null,
      buyerTier: 5,
      sellerOrgId: shop!.id,
      items: [{ inventoryItemId: item!.id, qty: 2 }],
      fulfilment: 'delivery',
      deliveryAddress: '12 Allen Avenue, Ikeja',
      deliveryLat: shop!.lat + 0.004,
      deliveryLng: shop!.lng + 0.004,
    })
    orderId = order.id
    assert.equal(order.status, 'pending_payment')
    const paid = await payOrder(orderId, userId, 'wallet')
    assert.equal(paid.ok, true, paid.ok ? '' : paid.error)
    const after = await getOrder(orderId)
    assert.equal(after!.status, 'confirmed')
    const balance = await getBalance('user', userId)
    assert.equal(
      Number(balance.available),
      toMinor(10_000) - Number(after!.total),
      'the order total left the wallet',
    )
  })

  await check('the buyer cannot confirm receipt before delivery', async () => {
    await assert.rejects(advanceOrder(orderId, 'completed', userId), /cannot move from confirmed/)
  })

  await check('track the order: it is listed and has a timeline', async () => {
    const mine = await ordersForBuyer(userId)
    assert.ok(mine.some((o) => o.id === orderId), 'the order is on the buyer’s orders list')
    const timeline = await orderTimeline(orderId)
    assert.deepEqual(
      timeline.map((t) => t.status),
      ['pending_payment', 'confirmed'],
    )
  })

  await check('the seller prepares, dispatches and delivers it', async () => {
    const owner = shop!.owner_user_id
    await advanceOrder(orderId, 'preparing', owner)
    await advanceOrder(orderId, 'dispatched', owner)
    await advanceOrder(orderId, 'delivered', owner)
    const tracked = await orderTimeline(orderId)
    assert.deepEqual(
      tracked.map((t) => t.status).slice(-3),
      ['preparing', 'dispatched', 'delivered'],
    )
  })

  await check('the buyer confirms the order was received', async () => {
    const sellerBefore = await getBalance('organisation', shop!.id)
    await advanceOrder(orderId, 'completed', userId)
    const done = await getOrder(orderId)
    assert.equal(done!.status, 'completed')
    assert.ok(done!.completed_at, 'completion is time-stamped')
    const sellerAfter = await getBalance('organisation', shop!.id)
    assert.ok(
      Number(sellerAfter.available) > Number(sellerBefore.available),
      'escrow was released to the seller',
    )
  })

  console.log(`\n${step} checks, ${process.exitCode ? 'FAILED' : 'all passed'}`)
  process.exit(process.exitCode ?? 0)
}

main().catch(() => process.exit(1))
