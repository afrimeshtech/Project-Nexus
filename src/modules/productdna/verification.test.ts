import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { assess, toPublicVerification, type RegistryFacts } from './verification.ts'

/**
 * AFRI-PDNA-TIS-001 §8 and §12. A wrong answer here tells a shopper a fake
 * is genuine, or brands a genuine product counterfeit.
 */
const genuineSerial: RegistryFacts = {
  identifierType: 'INDIVIDUAL_SERIAL',
  found: true,
  manufacturerVerified: true,
  manufacturerSignatureValid: true,
  identityStatus: 'ACTIVE',
  identificationLevel: 3,
  batchFound: true,
  lifecycleStatus: 'SOLD',
  saleRecorded: true,
}

describe('risk assessment', () => {
  test('a registered, sold serial from a verified manufacturer is VERIFIED with its evidence (§8)', () => {
    const result = assess(genuineSerial)
    assert.equal(result.risk, 'VERIFIED')
    assert.deepEqual(result.evidence, [
      'MANUFACTURER_RECORD_CONFIRMED',
      'SERIAL_REGISTERED',
      'BATCH_CONFIRMED',
      'COMMERCE_SALE_RECORDED',
    ])
  })

  test('an unregistered serial is INVALID (acceptance test 8)', () => {
    const result = assess({ identifierType: 'INDIVIDUAL_SERIAL', found: false })
    assert.equal(result.risk, 'INVALID')
    assert.deepEqual(result.signals, ['UNREGISTERED_SERIAL'])
  })

  test('an unknown batch-level reference proves nothing on its own', () => {
    assert.equal(assess({ identifierType: 'BATCH_REFERENCE', found: false }).risk, 'INCONCLUSIVE')
  })

  test('a bad manufacturer signature or a revoked identity is INVALID (acceptance test 4)', () => {
    assert.equal(assess({ ...genuineSerial, manufacturerSignatureValid: false }).risk, 'INVALID')
    assert.equal(assess({ ...genuineSerial, identityStatus: 'REVOKED' }).risk, 'INVALID')
  })

  test('a sold serial presented as new stock is SUSPICIOUS, not a verdict (acceptance test 11)', () => {
    const result = assess({ ...genuineSerial, presentedAsNewStock: true })
    assert.equal(result.risk, 'SUSPICIOUS')
    assert.ok(result.signals.includes('SOLD_SERIAL_PRESENTED_AS_NEW_STOCK'))
  })

  test('history that does not add up is SUSPICIOUS', () => {
    for (const flag of ['conflictingObservations', 'implausibleMovement', 'physicalEvidenceInconsistent'] as const) {
      assert.equal(assess({ ...genuineSerial, [flag]: true }).risk, 'SUSPICIOUS', flag)
    }
  })

  test('nothing the classifier returns can be COUNTERFEIT_CONFIRMED (§12)', () => {
    const worst = assess({
      ...genuineSerial,
      manufacturerSignatureValid: false,
      identityStatus: 'REVOKED',
      batchFound: false,
      presentedAsNewStock: true,
      conflictingObservations: true,
      implausibleMovement: true,
      physicalEvidenceInconsistent: true,
    })
    assert.ok(['VERIFIED', 'SUSPICIOUS', 'INVALID', 'INCONCLUSIVE'].includes(worst.risk))
  })

  test('a repeated scan alone never changes the result (§12)', () => {
    // Scan count is not an input: the same facts give the same answer however
    // many times they are assessed.
    const once = assess(genuineSerial)
    for (let i = 0; i < 50; i++) assert.deepEqual(assess(genuineSerial), once)
  })

  test('an unverified manufacturer or a suspended identity is not confirmation', () => {
    assert.equal(assess({ ...genuineSerial, manufacturerVerified: false }).risk, 'INCONCLUSIVE')
    assert.equal(assess({ ...genuineSerial, identityStatus: 'SUSPENDED' }).risk, 'INCONCLUSIVE')
  })
})

describe('public verification response', () => {
  test('matches the §8 contract field for field', () => {
    const response = toPublicVerification('ref-1', genuineSerial, assess(genuineSerial))
    assert.deepEqual(Object.keys(response).sort(), [
      'evidence',
      'identification_level',
      'identity_status',
      'lifecycle_status',
      'manufacturer_verified',
      'risk_status',
      'verification_reference',
    ])
    assert.equal(response.identity_status, 'CONFIRMED')
    assert.equal(response.risk_status, 'NO_CURRENT_ALERT')
    assert.equal(response.lifecycle_status, 'SOLD')
  })

  test('carries nothing private, whatever the facts hold (acceptance test 17)', () => {
    // Extra fields a future query might add must not pass through.
    const leaky = {
      ...genuineSerial,
      buyerName: 'Ada Nwosu',
      orderReference: 'AM-261104-E85848',
      signingKey: 'PRIVATE',
    } as RegistryFacts
    const text = JSON.stringify(toPublicVerification('ref-2', leaky, assess(leaky)))
    for (const secret of ['Ada', 'AM-261104', 'PRIVATE']) {
      assert.ok(!text.includes(secret), `leaked ${secret}`)
    }
  })

  test('a doubtful result raises an alert rather than claiming confirmation', () => {
    const facts = { ...genuineSerial, presentedAsNewStock: true }
    const response = toPublicVerification('ref-3', facts, assess(facts))
    assert.equal(response.identity_status, 'UNCONFIRMED')
    assert.equal(response.risk_status, 'ALERT_RAISED')
  })
})
