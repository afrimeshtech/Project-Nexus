import { getSql, withTx } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'
import { ensureWallet } from '@/modules/wallet/service'
import { slugify } from '@/modules/catalog/service'
import { normalisePhone, registerUser } from '@/modules/identity/service'
import { tierOf, type OrgType } from '@/lib/tiers'

/**
 * MODULE: organisations
 *
 * Business identity for every participant above the consumer: retail outlets,
 * merchants, dealer warehouses, manufacturers and delivery partners.
 *
 * "Trust by Design" (PRD Core Principles) starts here - an organisation can
 * neither sell nor be recommended until an administrator has verified it, and
 * `rankOffers` filters on exactly that flag.
 */

export interface Organisation {
  id: string
  name: string
  slug: string
  type: OrgType
  tier_level: number
  owner_user_id: string | null
  registration_number: string | null
  status: 'pending' | 'active' | 'suspended' | 'rejected'
  verification: 'unverified' | 'pending' | 'verified' | 'rejected'
  lat: number
  lng: number
  address: string | null
  city: string | null
  state: string | null
  country: string
  delivery_radius_km: number
  rating: number
  rating_count: number
  trust_score: number
  fulfilment_rate: number
  avg_dispatch_minutes: number
  phone: string | null
  email: string | null
  logo_url: string | null
  created_at: Date
  verified_at: Date | null
}

export interface RegisterOrgInput {
  name: string
  type: OrgType
  ownerUserId: string
  registrationNumber?: string | null
  lat: number
  lng: number
  address?: string | null
  city?: string | null
  state?: string | null
  phone?: string | null
  email?: string | null
  deliveryRadiusKm?: number
}

export async function registerOrganisation(input: RegisterOrgInput): Promise<Organisation> {
  return withTx(async (tx) => {
    let slug = slugify(input.name)
    const clash = await tx.one<{ id: string }>(`SELECT id FROM organisations WHERE slug = $1`, [
      slug,
    ])
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

    const org = await tx.one<Organisation>(
      `INSERT INTO organisations
         (name, slug, type, tier_level, owner_user_id, registration_number, lat, lng,
          address, city, state, phone, email, delivery_radius_km, status, verification)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending','pending')
       RETURNING *`,
      [
        input.name.trim(),
        slug,
        input.type,
        tierOf(input.type),
        input.ownerUserId,
        input.registrationNumber ?? null,
        input.lat,
        input.lng,
        input.address ?? null,
        input.city ?? null,
        input.state ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.deliveryRadiusKm ?? defaultRadiusFor(input.type),
      ],
    )
    if (!org) throw new Error('Failed to register organisation')

    await tx.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role_in_org)
       VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
      [org.id, input.ownerUserId],
    )

    // Give the business the role that matches its tier, so dashboards resolve.
    const role = roleForType(input.type)
    await tx.query(`UPDATE users SET role = $2 WHERE id = $1 AND role = 'consumer'`, [
      input.ownerUserId,
      role,
    ])

    await ensureWallet('organisation', org.id, 'NGN', tx)

    await publish(
      {
        type: EVENT.OrganisationRegistered,
        aggregateType: 'organisation',
        aggregateId: org.id,
        actorUserId: input.ownerUserId,
        payload: { name: org.name, type: org.type, city: org.city },
      },
      tx,
    )

    await queueNotification(
      {
        userId: input.ownerUserId,
        title: 'Business submitted for verification',
        body: `${org.name} is pending review. You can add inventory now; listings go live once verified.`,
        category: 'account',
        referenceType: 'organisation',
        referenceId: org.id,
      },
      tx,
    )

    return org
  })
}

/**
 * Larger tiers serve larger areas: a neighbourhood shop delivers a few
 * kilometres, a dealer warehouse supplies merchants across a state.
 */
function defaultRadiusFor(type: OrgType): number {
  switch (type) {
    case 'outlet':
      return 6
    case 'merchant':
      return 25
    case 'warehouse':
      return 120
    case 'manufacturer':
      return 400
    default:
      return 20
  }
}

function roleForType(type: OrgType) {
  switch (type) {
    case 'outlet':
      return 'outlet'
    case 'merchant':
      return 'merchant'
    case 'warehouse':
      return 'warehouse'
    case 'manufacturer':
      return 'manufacturer'
    default:
      return 'delivery_partner'
  }
}

// ---------------------------------------------------------------------------
// Verification (PRD Admin Module: user verification, merchant approval)
// ---------------------------------------------------------------------------

export async function verifyOrganisation(orgId: string, adminUserId: string): Promise<void> {
  await withTx(async (tx) => {
    const org = await tx.one<Organisation>(
      `UPDATE organisations
          SET verification = 'verified', status = 'active', verified_at = now(),
              trust_score = GREATEST(trust_score, 65)
        WHERE id = $1 RETURNING *`,
      [orgId],
    )
    if (!org) throw new Error('Organisation not found')

    await publish(
      {
        type: EVENT.OrganisationVerified,
        aggregateType: 'organisation',
        aggregateId: orgId,
        actorUserId: adminUserId,
        payload: { name: org.name, type: org.type },
      },
      tx,
    )
    if (org.owner_user_id) {
      await queueNotification(
        {
          userId: org.owner_user_id,
          title: 'Your business is verified',
          body: `${org.name} is live on AfriMesh. Your listings are now discoverable.`,
          category: 'account',
          referenceType: 'organisation',
          referenceId: orgId,
        },
        tx,
      )
    }
  })
}

export async function rejectOrganisation(
  orgId: string,
  adminUserId: string,
  reason: string,
): Promise<void> {
  await withTx(async (tx) => {
    const org = await tx.one<Organisation>(
      `UPDATE organisations SET verification = 'rejected', status = 'rejected' WHERE id = $1 RETURNING *`,
      [orgId],
    )
    if (!org) throw new Error('Organisation not found')
    await publish(
      {
        type: EVENT.OrganisationRejected,
        aggregateType: 'organisation',
        aggregateId: orgId,
        actorUserId: adminUserId,
        payload: { reason },
      },
      tx,
    )
    if (org.owner_user_id) {
      await queueNotification(
        {
          userId: org.owner_user_id,
          title: 'Verification unsuccessful',
          body: reason,
          category: 'account',
          referenceType: 'organisation',
          referenceId: orgId,
        },
        tx,
      )
    }
  })
}

export async function setOrganisationStatus(
  orgId: string,
  status: 'active' | 'suspended',
): Promise<void> {
  const sql = await getSql()
  await sql.query(`UPDATE organisations SET status = $2 WHERE id = $1`, [orgId, status])
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOrganisation(idOrSlug: string): Promise<Organisation | null> {
  const sql = await getSql()
  return sql.one<Organisation>(`SELECT * FROM organisations WHERE slug = $1 OR id::text = $1`, [
    idOrSlug,
  ])
}

export async function listOrganisations(
  opts: { type?: OrgType; verification?: string; search?: string; limit?: number } = {},
): Promise<(Organisation & { owner_name: string | null; sku_count: number })[]> {
  const sql = await getSql()
  const params: unknown[] = []
  const where: string[] = []

  if (opts.type) {
    params.push(opts.type)
    where.push(`o.type = $${params.length}`)
  }
  if (opts.verification) {
    params.push(opts.verification)
    where.push(`o.verification = $${params.length}`)
  }
  if (opts.search) {
    params.push(`%${opts.search.toLowerCase()}%`)
    where.push(`lower(o.name) LIKE $${params.length}`)
  }
  params.push(opts.limit ?? 100)

  return sql.query(
    `SELECT o.*, u.full_name AS owner_name,
            (SELECT COUNT(*)::int FROM inventory_items i WHERE i.organisation_id = o.id) AS sku_count
       FROM organisations o
       LEFT JOIN users u ON u.id = o.owner_user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (o.verification = 'pending') DESC, o.created_at DESC
      LIMIT $${params.length}`,
    params,
  )
}

export async function updateOrganisation(
  orgId: string,
  patch: {
    name?: string
    address?: string | null
    city?: string | null
    state?: string | null
    phone?: string | null
    lat?: number
    lng?: number
    deliveryRadiusKm?: number
    avgDispatchMinutes?: number
  },
): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `UPDATE organisations SET
        name = COALESCE($2, name),
        address = COALESCE($3, address),
        city = COALESCE($4, city),
        state = COALESCE($5, state),
        phone = COALESCE($6, phone),
        lat = COALESCE($7, lat),
        lng = COALESCE($8, lng),
        delivery_radius_km = COALESCE($9, delivery_radius_km),
        avg_dispatch_minutes = COALESCE($10, avg_dispatch_minutes)
      WHERE id = $1`,
    [
      orgId,
      patch.name ?? null,
      patch.address ?? null,
      patch.city ?? null,
      patch.state ?? null,
      patch.phone ?? null,
      patch.lat ?? null,
      patch.lng ?? null,
      patch.deliveryRadiusKm ?? null,
      patch.avgDispatchMinutes ?? null,
    ],
  )
  // Stock rows carry a copy of the location for fast geo ranking; keep in sync.
  if (patch.lat !== undefined && patch.lng !== undefined) {
    await sql.query(`UPDATE inventory_items SET lat = $2, lng = $3 WHERE organisation_id = $1`, [
      orgId,
      patch.lat,
      patch.lng,
    ])
  }
}

// ---------------------------------------------------------------------------
// Team - the owner and the sales reps who work the shop floor
// ---------------------------------------------------------------------------

export interface TeamMember {
  user_id: string
  full_name: string
  phone: string | null
  role_in_org: string
  is_owner: boolean
  last_login_at: Date | null
  joined_at: Date
}

export class TeamError extends Error {}

export async function listTeam(orgId: string): Promise<TeamMember[]> {
  const sql = await getSql()
  // The owner is joined from `owner_user_id` as well as the membership table:
  // businesses created before owners were written as members have no row.
  return sql.query<TeamMember>(
    `SELECT u.id AS user_id, u.full_name, u.phone,
            COALESCE(m.role_in_org, 'owner') AS role_in_org,
            (o.owner_user_id = u.id) AS is_owner,
            u.last_login_at, COALESCE(m.created_at, o.created_at) AS joined_at
       FROM organisations o
       JOIN users u ON u.id = o.owner_user_id
                    OR u.id IN (SELECT user_id FROM organisation_members WHERE organisation_id = o.id)
       LEFT JOIN organisation_members m ON m.organisation_id = o.id AND m.user_id = u.id
      WHERE o.id = $1
      ORDER BY (o.owner_user_id = u.id) DESC, COALESCE(m.created_at, o.created_at) ASC`,
    [orgId],
  )
}

/**
 * Put a sales rep on the business, by phone number.
 *
 * The rep signs in with that number (OTP), so an owner can add someone who has
 * never opened AfriMesh: the account is created here and is theirs from the
 * first code they receive. An existing account is attached as it is.
 *
 * A person works for one business. `currentOrganisation` resolves a single
 * business per person, so a second membership would silently put them in
 * whichever one sorts first - refused here instead.
 */
export async function addSalesRep(
  orgId: string,
  input: { fullName: string; phone: string },
  actorUserId: string,
): Promise<TeamMember> {
  const phone = normalisePhone(input.phone)
  if (!phone) throw new TeamError('Enter a valid phone number.')

  const sql = await getSql()
  let user = await sql.one<{ id: string; role: string; full_name: string }>(
    `SELECT id, role, full_name FROM users WHERE phone = $1`,
    [phone],
  )

  if (user) {
    if (user.id === actorUserId) throw new TeamError('You are already the owner of this business.')
    // Riders, administrators and other businesses have dashboards of their
    // own; folding them into a shop's team would hand them a second identity.
    if (user.role !== 'consumer') {
      throw new TeamError('That number belongs to another business or delivery account.')
    }
    const elsewhere = await sql.one<{ name: string; same: boolean }>(
      `SELECT o.name, (o.id = $2) AS same
         FROM organisation_members m JOIN organisations o ON o.id = m.organisation_id
        WHERE m.user_id = $1
        LIMIT 1`,
      [user.id, orgId],
    )
    if (elsewhere?.same) throw new TeamError(`${user.full_name} is already on your team.`)
    if (elsewhere) throw new TeamError('That person already works for another business.')
  } else {
    user = await registerUser({ fullName: input.fullName, phone })
  }

  const memberId = user.id
  return withTx(async (tx) => {
    await tx.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role_in_org)
       VALUES ($1, $2, 'sales_rep')`,
      [orgId, memberId],
    )
    const org = await tx.one<{ name: string }>(`SELECT name FROM organisations WHERE id = $1`, [
      orgId,
    ])

    await publish(
      {
        type: EVENT.MemberAdded,
        aggregateType: 'organisation',
        aggregateId: orgId,
        actorUserId,
        payload: { userId: memberId, role: 'sales_rep' },
      },
      tx,
    )
    await queueNotification(
      {
        userId: memberId,
        title: `You have been added to ${org?.name ?? 'a business'}`,
        body: 'You can now manage stock and fulfil orders from the business dashboard.',
        category: 'account',
        referenceType: 'organisation',
        referenceId: orgId,
      },
      tx,
    )

    const member = await tx.one<TeamMember>(
      `SELECT u.id AS user_id, u.full_name, u.phone, m.role_in_org, FALSE AS is_owner,
              u.last_login_at, m.created_at AS joined_at
         FROM organisation_members m JOIN users u ON u.id = m.user_id
        WHERE m.organisation_id = $1 AND m.user_id = $2`,
      [orgId, memberId],
    )
    if (!member) throw new Error('Failed to add team member')
    return member
  })
}

/**
 * Take a sales rep off the business. Access ends on their next request:
 * every partner page and action re-resolves membership, so there is no cached
 * permission to outlive the row. The owner cannot be removed this way.
 */
export async function removeTeamMember(
  orgId: string,
  memberUserId: string,
  actorUserId: string,
): Promise<void> {
  await withTx(async (tx) => {
    const removed = await tx.one<{ user_id: string }>(
      `DELETE FROM organisation_members m
        USING organisations o
        WHERE m.organisation_id = $1 AND m.user_id = $2
          AND o.id = m.organisation_id
          AND m.role_in_org <> 'owner'
          AND o.owner_user_id IS DISTINCT FROM m.user_id
        RETURNING m.user_id`,
      [orgId, memberUserId],
    )
    if (!removed) throw new TeamError('That person is not a sales rep on this business.')

    await publish(
      {
        type: EVENT.MemberRemoved,
        aggregateType: 'organisation',
        aggregateId: orgId,
        actorUserId,
        payload: { userId: memberUserId },
      },
      tx,
    )
  })
}

export async function ratingsFor(orgId: string, limit = 20) {
  const sql = await getSql()
  return sql.query<{
    stars: number
    comment: string | null
    created_at: Date
    rater_name: string
  }>(
    `SELECT r.stars, r.comment, r.created_at, u.full_name AS rater_name
       FROM ratings r JOIN users u ON u.id = r.rater_user_id
      WHERE r.organisation_id = $1
      ORDER BY r.created_at DESC LIMIT $2`,
    [orgId, limit],
  )
}
