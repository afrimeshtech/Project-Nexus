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
    // The regression this exists for: paystack has no adapter yet, and the old
    // resolver answered that with the mock — quietly giving goods away.
    for (const name of ['paystack', 'flutterwave', 'typo', '']) {
      process.env.PAYMENT_PROVIDER = name
      assert.throws(() => gateway(), PaymentConfigError, `should refuse "${name}"`)
    }
  })

  test('the refusal names the provider and the available adapters', () => {
    process.env.PAYMENT_PROVIDER = 'paystack'
    try {
      gateway()
      assert.fail('expected a throw')
    } catch (err) {
      const message = (err as Error).message
      assert.match(message, /paystack/)
      assert.match(message, /mock/)
    }
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
    assert.equal(result.success, true)
    assert.match(result.providerRef, /^MOCK-[0-9A-F]{12}$/)
  })

  test('declines any amount ending in .13, so the failure path stays exercisable', async () => {
    delete process.env.PAYMENT_PROVIDER
    const result = await gateway().charge({ ...request, amount: 1_013 })
    assert.equal(result.success, false)
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
    assert.equal(result.success, true)
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
