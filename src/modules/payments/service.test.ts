import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { gateway, PaymentConfigError, PAYMENT_METHOD_LABEL } from './service.ts'

/**
 * The gateway resolver is the smallest piece of this module and the one with
 * the largest downside if it is wrong: it decides whether real money is taken.
 * It used to end `?? mockGateway`, so a production deployment naming a provider
 * with no adapter behind it settled every order without charging anyone.
 */

const original = process.env.PAYMENT_PROVIDER

afterEach(() => {
  if (original === undefined) delete process.env.PAYMENT_PROVIDER
  else process.env.PAYMENT_PROVIDER = original
})

describe('gateway resolution', () => {
  test('defaults to the mock when nothing is configured', () => {
    delete process.env.PAYMENT_PROVIDER
    assert.equal(gateway().name, 'mock')
  })

  test('returns the mock only when it is asked for by name', () => {
    process.env.PAYMENT_PROVIDER = 'mock'
    assert.equal(gateway().name, 'mock')
  })

  test('refuses an unknown provider rather than falling back to the mock', () => {
    // The regression this exists for: the old resolver ended `?? mockGateway`,
    // so a provider with no adapter behind it quietly gave goods away.
    for (const name of ['flutterwave', 'typo', '']) {
      process.env.PAYMENT_PROVIDER = name
      assert.throws(() => gateway(), PaymentConfigError, `should refuse "${name}"`)
    }
  })

  test('the refusal names the provider and the available adapters', () => {
    process.env.PAYMENT_PROVIDER = 'flutterwave'
    try {
      gateway()
      assert.fail('expected a throw')
    } catch (err) {
      const message = (err as Error).message
      assert.match(message, /flutterwave/)
      assert.match(message, /mock/)
      assert.match(message, /paystack/)
    }
  })
})

describe('paystack configuration', () => {
  const key = process.env.PAYSTACK_SECRET_KEY
  const site = process.env.SITE_URL

  afterEach(() => {
    if (key === undefined) delete process.env.PAYSTACK_SECRET_KEY
    else process.env.PAYSTACK_SECRET_KEY = key
    if (site === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = site
  })

  /*
   * These two refusals are the reason the adapter can be trusted to be either
   * fully wired or absent. Both failure modes are silent at deploy time and
   * loud only at a customer's checkout, which is the worst place to find them.
   */
  test('refuses paystack without a secret key', () => {
    process.env.PAYMENT_PROVIDER = 'paystack'
    delete process.env.PAYSTACK_SECRET_KEY
    assert.throws(() => gateway(), PaymentConfigError)
  })

  test('refuses paystack without SITE_URL, which it needs for the callback', () => {
    process.env.PAYMENT_PROVIDER = 'paystack'
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_notreal'
    delete process.env.SITE_URL
    assert.throws(() => gateway(), PaymentConfigError)
  })

  test('resolves once both are set', () => {
    process.env.PAYMENT_PROVIDER = 'paystack'
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_notreal'
    process.env.SITE_URL = 'https://afrimesh.ng'
    const resolved = gateway()
    assert.equal(resolved.name, 'paystack')
  })

  test('takes the four external methods and refuses wallet', () => {
    process.env.PAYMENT_PROVIDER = 'paystack'
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_notreal'
    process.env.SITE_URL = 'https://afrimesh.ng'
    const paystack = gateway()
    for (const method of ['card', 'bank_transfer', 'ussd', 'qr'] as const) {
      assert.equal(paystack.supports(method), true, `${method} should be supported`)
    }
    // A wallet debit is settled against our own ledger and must never be sent
    // to a gateway.
    assert.equal(paystack.supports('wallet'), false)
  })
})

describe('the mock gateway', () => {
  const request = {
    amount: 500_00,
    currency: 'NGN',
    method: 'card' as const,
    reference: 'AM-TEST-0001',
    customer: { userId: 'u1' },
  }

  test('settles a charge and hands back a provider reference', async () => {
    delete process.env.PAYMENT_PROVIDER
    const result = await gateway().charge(request)
    assert.equal(result.status, 'succeeded')
    assert.match(result.providerRef, /^MOCK-[0-9A-F]{12}$/)
  })

  test('declines any amount ending in .13, so the failure path stays exercisable', async () => {
    delete process.env.PAYMENT_PROVIDER
    const result = await gateway().charge({ ...request, amount: 1_013 })
    assert.equal(result.status, 'failed')
    assert.ok(result.failureReason, 'a decline must say why')
  })

  test('USSD returns a code for the customer to dial rather than settling silently', async () => {
    delete process.env.PAYMENT_PROVIDER
    const result = await gateway().charge({ ...request, method: 'ussd' })
    assert.equal(result.actionRequired?.kind, 'ussd_code')
  })

  test('a refund references the original charge', async () => {
    delete process.env.PAYMENT_PROVIDER
    const result = await gateway().refund('MOCK-ABCDEF123456', 500_00)
    assert.equal(result.status, 'succeeded')
    assert.match(result.providerRef, /MOCK-ABCDEF123456/)
  })
})

describe('payment methods', () => {
  test('every method a caller can pass has a label a shopper can read', () => {
    const methods = ['wallet', 'bank_transfer', 'card', 'ussd', 'qr'] as const
    for (const m of methods) {
      assert.ok(PAYMENT_METHOD_LABEL[m], `${m} needs a label`)
      assert.ok(!PAYMENT_METHOD_LABEL[m].includes('_'), `${m} label leaks the enum name`)
    }
  })
})
