import { getSql, withTx, type Sql } from '@/db/client'
import { canTransitionIdentity, mayRegisterProducts, type IdentityStatus, type ManufacturerStatus } from '@/modules/productdna/states'

/**
 * MODULE: productdna - Manufacturer Registry and Product Identity Registry
 * (AFRI-PDNA-TIS-001 §3 modules 1 and 3, §7; implementation Phase 1)
 *
 * "Manufacturer-originated product identifiers remain the source of identity
 * authority. ProductDNA validates and registers manufacturer submissions."
 *
 * Built and tested, not reachable: the only way in is /api/v1/productdna,
 * which answers 501 until PRODUCTDNA_LAUNCHED (src/lib/launch-productdna.ts).
 * Manufacturer authentication (module 2) arrives with that API and is the
 * caller's responsibility - these functions take an already-authenticated
 * manufacturer id.
 *
 * Every change writes a lifecycle-independent audit record to the platform
 * event log, so identity changes are traceable (§2 "every material identity
 * and lifecycle change must be auditable").
 */

export class ProductDnaRuleError extends Error {}

export interface Manufacturer {
  id: string
  manufacturer_code: string | null
  legal_name: string
  registration_number: string | null
  verification_status: ManufacturerStatus
  country_code: string | null
}

export interface ProductIdentity {
  id: string
  manufacturer_id: string
  manufacturer_product_reference: string
  product_name: string
  brand_reference: string | null
  category_id: string
  identification_level: 1 | 2 | 3
  identity_status: IdentityStatus
}

async function audit(
  sql: Sql,
  type: string,
  aggregateType: string,
  aggregateId: string,
  actorUserId: string | null,
  payload: Record<string, unknown>,
) {
  await sql.query(
    `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [type, aggregateType, aggregateId, actorUserId, JSON.stringify(payload)],
  )
}

/** POST /manufacturers. A manufacturer starts PENDING; nothing it submits counts until verified. */
export async function registerManufacturer(
  input: {
    manufacturerCode?: string | null
    legalName: string
    registrationNumber?: string | null
    countryCode?: string | null
    commerceOrganisationReference?: string | null
  },
  actorUserId: string | null,
): Promise<Manufacturer> {
  const legalName = input.legalName.trim()
  if (!legalName) throw new ProductDnaRuleError('A manufacturer needs its legal name.')
  if (input.countryCode && !/^[A-Z]{2}$/.test(input.countryCode)) {
    throw new ProductDnaRuleError('A country code is two capital letters (ISO 3166-1), e.g. NG.')
  }
  return withTx(async (tx) => {
    const row = await tx.one<Manufacturer>(
      `INSERT INTO productdna.manufacturers
         (manufacturer_code, legal_name, registration_number, country_code, commerce_organisation_reference)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (manufacturer_code) DO NOTHING
       RETURNING id, manufacturer_code, legal_name, registration_number, verification_status, country_code`,
      [
        input.manufacturerCode ?? null,
        legalName,
        input.registrationNumber ?? null,
        input.countryCode ?? null,
        input.commerceOrganisationReference ?? null,
      ],
    )
    if (!row) throw new ProductDnaRuleError('That manufacturer code is already registered.')
    await audit(tx, 'productdna.manufacturer_registered', 'pdna_manufacturer', row.id, actorUserId, {
      manufacturerCode: row.manufacturer_code,
    })
    return row
  })
}

/**
 * POST /manufacturers/{id}/verify, and the other status moves. Verification
 * is an administrator's decision, made against the manufacturer's legal
 * documents outside the system.
 */
export async function setManufacturerStatus(
  manufacturerId: string,
  status: ManufacturerStatus,
  actorUserId: string,
): Promise<Manufacturer> {
  return withTx(async (tx) => {
    const before = await tx.one<{ verification_status: ManufacturerStatus }>(
      `SELECT verification_status FROM productdna.manufacturers WHERE id = $1 FOR UPDATE`,
      [manufacturerId],
    )
    if (!before) throw new ProductDnaRuleError('Manufacturer not found.')
    const row = await tx.one<Manufacturer>(
      `UPDATE productdna.manufacturers SET verification_status = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, manufacturer_code, legal_name, registration_number, verification_status, country_code`,
      [manufacturerId, status],
    )
    await audit(tx, 'productdna.manufacturer_status_changed', 'pdna_manufacturer', manufacturerId, actorUserId, {
      from: before.verification_status,
      to: status,
    })
    return row!
  })
}

/**
 * POST /products - the §7 registration contract, in order:
 *   1-2. the manufacturer is authenticated (by the caller) and VERIFIED
 *   3.   it has authority to register: it registers only under its own id
 *   4.   mandatory attributes are present and valid
 *   5.   a duplicate reference is rejected - by the database's UNIQUE
 *        constraint, so two concurrent registrations cannot both win
 *   6-7. the identity is registered with a ProductDNA UUID
 *   8.   the registration is audited
 * The identity starts REGISTERED; activation is its own, audited step.
 */
export async function registerProductIdentity(
  manufacturerId: string,
  input: {
    manufacturerProductReference: string
    productName: string
    brandReference?: string | null
    categoryId: string
    identificationLevel: 1 | 2 | 3
  },
  actorUserId: string | null,
): Promise<ProductIdentity> {
  const reference = input.manufacturerProductReference.trim()
  const name = input.productName.trim()
  if (!reference) throw new ProductDnaRuleError('A product reference is required.')
  if (reference.length > 128) throw new ProductDnaRuleError('A product reference is at most 128 characters.')
  if (!name) throw new ProductDnaRuleError('A product name is required.')
  if (![1, 2, 3].includes(input.identificationLevel)) {
    throw new ProductDnaRuleError('The identification level is 1 (product), 2 (batch) or 3 (serial).')
  }

  return withTx(async (tx) => {
    const manufacturer = await tx.one<{ verification_status: ManufacturerStatus }>(
      `SELECT verification_status FROM productdna.manufacturers WHERE id = $1`,
      [manufacturerId],
    )
    if (!manufacturer) throw new ProductDnaRuleError('Manufacturer not found.')
    if (!mayRegisterProducts(manufacturer.verification_status)) {
      throw new ProductDnaRuleError('Only a verified manufacturer can register products.')
    }
    const row = await tx.one<ProductIdentity>(
      `INSERT INTO productdna.product_identities
         (manufacturer_id, manufacturer_product_reference, product_name, brand_reference,
          category_id, identification_level, identity_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'REGISTERED')
       ON CONFLICT (manufacturer_id, manufacturer_product_reference) DO NOTHING
       RETURNING id, manufacturer_id, manufacturer_product_reference, product_name,
                 brand_reference, category_id, identification_level, identity_status`,
      [manufacturerId, reference, name, input.brandReference ?? null, input.categoryId, input.identificationLevel],
    )
    if (!row) throw new ProductDnaRuleError('That product reference is already registered by this manufacturer.')
    await audit(tx, 'productdna.product_registered', 'pdna_product_identity', row.id, actorUserId, {
      manufacturerId,
      reference,
      identificationLevel: input.identificationLevel,
    })
    return row
  })
}

/** Identity status moves, held to the §10 state machine. */
export async function setIdentityStatus(
  productIdentityId: string,
  to: IdentityStatus,
  actorUserId: string,
): Promise<ProductIdentity> {
  return withTx(async (tx) => {
    const current = await tx.one<{ identity_status: IdentityStatus }>(
      `SELECT identity_status FROM productdna.product_identities WHERE id = $1 FOR UPDATE`,
      [productIdentityId],
    )
    if (!current) throw new ProductDnaRuleError('Product identity not found.')
    if (!canTransitionIdentity(current.identity_status, to)) {
      throw new ProductDnaRuleError(`An identity cannot move from ${current.identity_status} to ${to}.`)
    }
    const row = await tx.one<ProductIdentity>(
      `UPDATE productdna.product_identities SET identity_status = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, manufacturer_id, manufacturer_product_reference, product_name,
                  brand_reference, category_id, identification_level, identity_status`,
      [productIdentityId, to],
    )
    await audit(tx, 'productdna.identity_status_changed', 'pdna_product_identity', productIdentityId, actorUserId, {
      from: current.identity_status,
      to,
    })
    return row!
  })
}

/** Phase 3: say which ProductDNA identity a Commerce catalogue product is. */
export async function linkCommerceProduct(
  productIdentityId: string,
  commerceProductReference: string,
  actorUserId: string,
): Promise<void> {
  const sql = await getSql()
  const linked = await sql.one<{ product_identity_id: string }>(
    `INSERT INTO productdna.commerce_product_links (product_identity_id, commerce_product_reference)
     VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING product_identity_id`,
    [productIdentityId, commerceProductReference],
  )
  if (!linked) throw new ProductDnaRuleError('That Commerce product is already linked to an identity.')
  await audit(sql, 'productdna.commerce_product_linked', 'pdna_product_identity', productIdentityId, actorUserId, {
    commerceProductReference,
  })
}
