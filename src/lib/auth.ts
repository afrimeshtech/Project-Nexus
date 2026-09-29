import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import {
  resolveSession,
  revokeSession,
  SESSION_COOKIE_NAME,
  type User,
  type UserRole,
} from '@/modules/identity/service'
import { getSql } from '@/db/client'
import { can, memberRoleFrom, type OrgCapability, type OrgMemberRole } from '@/lib/org-access'

/**
 * Session plumbing for the App Router, plus the RBAC guards every protected
 * route uses. Role checks live here so authorisation is stated once.
 */

export const SESSION_COOKIE = SESSION_COOKIE_NAME

/** Cached per-request so a page with ten server components hits the DB once. */
export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies()
  return resolveSession(jar.get(SESSION_COOKIE)?.value)
})

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  await revokeSession(token)
  jar.delete(SESSION_COOKIE)
}

/** Require any signed-in user. */
export async function requireUser(returnTo = '/'): Promise<User> {
  const user = await currentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`)
  return user
}

/** Require one of a set of roles (SAD RBAC). */
export async function requireRole(roles: UserRole[], returnTo = '/'): Promise<User> {
  const user = await requireUser(returnTo)
  if (!roles.includes(user.role)) redirect('/forbidden')
  return user
}

export const ADMIN_ROLES: UserRole[] = ['platform_admin', 'super_admin', 'auditor']

/**
 * The organisation a business user acts on behalf of. Every partner dashboard
 * resolves this first, then scopes all of its queries by the returned id -
 * that is what keeps one merchant from reading another merchant's inventory.
 *
 * `member_role` is what the signed-in person is *inside* that business: the
 * owner, or a sales rep the owner added. Scoping by org id keeps businesses
 * apart; `member_role` (through `can`) keeps a rep away from the owner's money.
 */
export const currentOrganisation = cache(
  async (): Promise<{
    id: string
    name: string
    type: 'manufacturer' | 'warehouse' | 'merchant' | 'outlet' | 'logistics'
    tier_level: number
    verification: string
    status: string
    logo_url: string | null
    lat: number
    lng: number
    city: string | null
    state: string | null
    address: string | null
    delivery_radius_km: number
    rating: number
    rating_count: number
    fulfilment_rate: number
    avg_dispatch_minutes: number
    member_role: OrgMemberRole
  } | null> => {
    const user = await currentUser()
    if (!user) return null
    const sql = await getSql()
    const row = await sql.one<{
      id: string
      name: string
      type: 'manufacturer' | 'warehouse' | 'merchant' | 'outlet' | 'logistics'
      tier_level: number
      verification: string
      status: string
      logo_url: string | null
      lat: number
      lng: number
      city: string | null
      state: string | null
      address: string | null
      delivery_radius_km: number
      rating: number
      rating_count: number
      fulfilment_rate: number
      avg_dispatch_minutes: number
      owner_user_id: string | null
      role_in_org: string | null
    }>(
      `SELECT o.*, m.role_in_org
         FROM organisations o
         LEFT JOIN organisation_members m ON m.organisation_id = o.id AND m.user_id = $1
        WHERE o.owner_user_id = $1 OR m.user_id IS NOT NULL
        ORDER BY (o.owner_user_id = $1) DESC NULLS LAST, o.created_at ASC
        LIMIT 1`,
      [user.id],
    )
    if (!row) return null
    const { role_in_org, ...org } = row
    return {
      ...org,
      member_role: memberRoleFrom({
        isOrgOwner: org.owner_user_id === user.id,
        roleInOrg: role_in_org,
      }),
    }
  },
)

/** Require a verified organisation of one of the given types. */
export async function requireOrganisation(
  types: Array<'manufacturer' | 'warehouse' | 'merchant' | 'outlet' | 'logistics'>,
  returnTo = '/',
) {
  const user = await requireUser(returnTo)
  const org = await currentOrganisation()
  if (!org || !types.includes(org.type)) redirect('/onboarding')
  return { user, org }
}

/**
 * Page guard for the partner dashboard: signed in, belongs to a business, and
 * is allowed this part of it. A sales rep who follows an old link to the
 * wallet lands on the dashboard home, not on an error.
 */
export async function requireOrgCapability(capability: OrgCapability, returnTo = '/partner') {
  const user = await requireUser(returnTo)
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')
  if (!can(org.member_role, capability)) redirect('/partner?restricted=1')
  return { user, org }
}

/**
 * Action guard: the caller's organisation, only if they may use this
 * capability. Returns null otherwise, and the action reports it - an action is
 * a public endpoint, so hiding its button is not enough.
 */
export async function organisationFor(capability: OrgCapability) {
  const org = await currentOrganisation()
  if (!org || !can(org.member_role, capability)) return null
  return org
}
