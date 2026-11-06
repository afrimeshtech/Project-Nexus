import type { IdentityStatus, LifecycleStatus } from '@/modules/productdna/states'

/**
 * MODULE: productdna - verification and risk (AFRI-PDNA-TIS-001 §8, §12)
 *
 * Turns what the registry knows about an identifier into a risk class and an
 * evidence list, and shapes the answer a member of the public may see.
 *
 * Two rules from §12 are structural here, not checks that could be skipped:
 *   - the classifier cannot return COUNTERFEIT_CONFIRMED. It is not in
 *     RiskClass; only an investigation records it (product_risk_alerts).
 *   - a repeated scan alone never raises the risk. Scan count is not an input.
 *
 * Pure functions - no database - so every rule is unit-tested while the
 * feature is dormant (see src/lib/launch-productdna.ts).
 */

/** §12. COUNTERFEIT_CONFIRMED is deliberately absent: see above. */
export type RiskClass = 'VERIFIED' | 'SUSPICIOUS' | 'INVALID' | 'INCONCLUSIVE'

export type IdentifierType = 'INDIVIDUAL_SERIAL' | 'BATCH_REFERENCE' | 'PRODUCT_REFERENCE'

/** Positive findings, as named in the §8 example response. */
export type Evidence =
  | 'MANUFACTURER_RECORD_CONFIRMED'
  | 'SERIAL_REGISTERED'
  | 'BATCH_CONFIRMED'
  | 'COMMERCE_SALE_RECORDED'

/** The §12 conditions ProductDNA must recognise. */
export type RiskSignal =
  | 'UNREGISTERED_SERIAL'
  | 'INVALID_MANUFACTURER_SIGNATURE'
  | 'REVOKED_PRODUCT_IDENTITY'
  | 'INVALID_BATCH_REFERENCE'
  | 'SOLD_SERIAL_PRESENTED_AS_NEW_STOCK'
  | 'CONFLICTING_SERIAL_OBSERVATIONS'
  | 'IMPLAUSIBLE_GEOGRAPHIC_MOVEMENT'
  | 'INCONSISTENT_PHYSICAL_SECURITY_EVIDENCE'

/** Everything the registry found about one identifier. */
export interface RegistryFacts {
  identifierType: IdentifierType
  /** Nothing in the registry matches the identifier at all. */
  found: boolean
  manufacturerVerified?: boolean
  manufacturerSignatureValid?: boolean
  identityStatus?: IdentityStatus
  identificationLevel?: 1 | 2 | 3
  batchFound?: boolean
  lifecycleStatus?: LifecycleStatus
  saleRecorded?: boolean
  /** The unit is offered as new stock while its record says SOLD with no authorised return. */
  presentedAsNewStock?: boolean
  conflictingObservations?: boolean
  implausibleMovement?: boolean
  physicalEvidenceInconsistent?: boolean
}

export interface Assessment {
  risk: RiskClass
  evidence: Evidence[]
  signals: RiskSignal[]
}

/** Signals that, on their own, mean the identifier cannot be genuine as presented. */
const INVALIDATING: readonly RiskSignal[] = [
  'UNREGISTERED_SERIAL',
  'INVALID_MANUFACTURER_SIGNATURE',
  'REVOKED_PRODUCT_IDENTITY',
  'INVALID_BATCH_REFERENCE',
]

/**
 * Evidence-based (§2): each conclusion follows from named facts, and the
 * facts are returned with it so the decision is auditable (acceptance test 18).
 *
 * INVALID - the record contradicts the item (unregistered serial, bad
 *           signature, revoked identity, unknown batch).
 * SUSPICIOUS - the item is registered but its history does not add up (sold
 *           unit back on a shelf, conflicting sightings, impossible travel,
 *           wrong physical security features). Worth an investigation, not
 *           a verdict.
 * INCONCLUSIVE - not enough to say either way: nothing matched an identifier
 *           that was never serialised, or the manufacturer is unverified.
 * VERIFIED - every check that applies passed and nothing is outstanding.
 */
export function assess(facts: RegistryFacts): Assessment {
  const evidence: Evidence[] = []
  const signals: RiskSignal[] = []

  if (!facts.found) {
    // An unknown serial is a positive finding against the item - serials are
    // registered by the manufacturer. Unknown batch or product references
    // may simply predate the registry, so they prove nothing on their own.
    if (facts.identifierType === 'INDIVIDUAL_SERIAL') {
      return { risk: 'INVALID', evidence, signals: ['UNREGISTERED_SERIAL'] }
    }
    return { risk: 'INCONCLUSIVE', evidence, signals }
  }

  if (facts.manufacturerVerified) evidence.push('MANUFACTURER_RECORD_CONFIRMED')
  if (facts.identifierType === 'INDIVIDUAL_SERIAL') evidence.push('SERIAL_REGISTERED')
  if (facts.batchFound) evidence.push('BATCH_CONFIRMED')
  if (facts.saleRecorded) evidence.push('COMMERCE_SALE_RECORDED')

  if (facts.manufacturerSignatureValid === false) signals.push('INVALID_MANUFACTURER_SIGNATURE')
  if (facts.identityStatus === 'REVOKED') signals.push('REVOKED_PRODUCT_IDENTITY')
  if (facts.batchFound === false) signals.push('INVALID_BATCH_REFERENCE')
  if (facts.presentedAsNewStock) signals.push('SOLD_SERIAL_PRESENTED_AS_NEW_STOCK')
  if (facts.conflictingObservations) signals.push('CONFLICTING_SERIAL_OBSERVATIONS')
  if (facts.implausibleMovement) signals.push('IMPLAUSIBLE_GEOGRAPHIC_MOVEMENT')
  if (facts.physicalEvidenceInconsistent) signals.push('INCONSISTENT_PHYSICAL_SECURITY_EVIDENCE')

  if (signals.some((s) => INVALIDATING.includes(s))) return { risk: 'INVALID', evidence, signals }
  if (signals.length) return { risk: 'SUSPICIOUS', evidence, signals }
  // A genuine record from a manufacturer we have not verified is not
  // confirmation of anything.
  if (!facts.manufacturerVerified) return { risk: 'INCONCLUSIVE', evidence, signals }
  // A suspended identity is still genuine, but not currently vouched for.
  if (facts.identityStatus !== 'ACTIVE') return { risk: 'INCONCLUSIVE', evidence, signals }
  return { risk: 'VERIFIED', evidence, signals }
}

/**
 * The public verification response, exactly the §8 contract. It is built
 * field by field from an Assessment - never by spreading a database row - so
 * a buyer's identity, an order reference or a manufacturer's credentials
 * cannot leak into it by being added to a query later (§8, acceptance test 17).
 */
export interface PublicVerification {
  verification_reference: string
  identity_status: 'CONFIRMED' | 'UNCONFIRMED'
  lifecycle_status: LifecycleStatus | 'UNKNOWN'
  risk_status: 'NO_CURRENT_ALERT' | 'ALERT_RAISED' | 'NOT_VERIFIABLE'
  identification_level: 1 | 2 | 3 | null
  manufacturer_verified: boolean
  evidence: Evidence[]
}

export function toPublicVerification(
  verificationReference: string,
  facts: RegistryFacts,
  assessment: Assessment,
): PublicVerification {
  return {
    verification_reference: verificationReference,
    identity_status: assessment.risk === 'VERIFIED' ? 'CONFIRMED' : 'UNCONFIRMED',
    lifecycle_status: facts.lifecycleStatus ?? 'UNKNOWN',
    risk_status:
      assessment.risk === 'VERIFIED'
        ? 'NO_CURRENT_ALERT'
        : assessment.risk === 'INCONCLUSIVE'
          ? 'NOT_VERIFIABLE'
          : 'ALERT_RAISED',
    identification_level: facts.identificationLevel ?? null,
    manufacturer_verified: Boolean(facts.manufacturerVerified),
    evidence: [...assessment.evidence],
  }
}
