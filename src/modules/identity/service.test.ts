import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isEmail, otpDestination } from './service.ts'

describe('one-time code destinations', () => {
  test('an email address is stored as the address, lowercased', () => {
    assert.equal(otpDestination('  Ada@Example.NG '), 'ada@example.ng')
  })

  test('an email address with digits is not mistaken for a phone number', () => {
    // normalisePhone strips everything but digits, which turned this into "2".
    assert.equal(otpDestination('ada2@example.ng'), 'ada2@example.ng')
    assert.equal(otpDestination('0803shop@example.ng'), '0803shop@example.ng')
  })

  test('Nigerian phone numbers normalise to one E.164 form', () => {
    assert.equal(otpDestination('08031234567'), '+2348031234567')
    assert.equal(otpDestination('+234 803 123 4567'), '+2348031234567')
    assert.equal(otpDestination('2348031234567'), '+2348031234567')
  })

  test('isEmail decides by the @', () => {
    assert.equal(isEmail('ada@example.ng'), true)
    assert.equal(isEmail('08031234567'), false)
  })
})
