import { createHash, randomBytes } from 'node:crypto'
import { getSql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'

/**
 * MODULE: api
 *
 * The public platform API's identity layer.
 *
 * "AfriMesh will be API-first ... Future enterprise APIs will enable
 * integration with banks, manufacturers, logistics companies, and government
 * systems. API licensing is expected to become a strategic revenue stream."
 * — CIM Volume III §9.
 *
 * A machine client is not a browser session. It has no cookie jar, nobody to
 * re-authenticate it at 3am, and it may legitimately act for years. So it
 * carries a key: issued once, shown once, stored hashed, revocable instantly,
 * bound to one organisation and to an explicit set of scopes.
 *
 * The three things every call goes through — authenticate, check scope, count
 * against the rate limit — live here rather than in each route, because a
 * check that each endpoint has to remember is a check that a new endpoint will
 * forget.
 */

/**
 * Scopes mirror the CIM's core API domains. Read and write are separate
 * everywhere: the common integration is a read-only one, and it should not be
 * able to place an order because it needed to see stock.
 */
export const API_SCOPES = [
  'products:read',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:write',
  'logistics:read',
  'analytics:read',
] as const

export type ApiScope = (typeof API_SCOPES)[number]

export const SCOPE_LABEL: Record<ApiScope, string> = {
  'products:read': 'Read the master product catalogue',
  'inventory:read': 'Read your own stock levels and prices',
  'inventory:write': 'Adjust your own stock levels and prices',
  'orders:read': 'Read orders placed with you',
  'orders:write': 'Advance and cancel your own orders',
  'logistics:read': 'Read delivery jobs for your orders',
  'analytics:read': 'Read your own sales and demand figures',
}

export interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  organisation_id: string | null
  scopes: string[]
  status: 'active' | 'revoked'
  rate_limit_per_min: number
  created_at: Date
  last_used_at: Date | null
  expires_at: Date | null
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Environment marker, so a test key is never mistaken for a live one. */
const KEY_PREFIX = 'am_live'

// ---------------------------------------------------------------------------
// Issuing and revoking
// ---------------------------------------------------------------------------

/**
 * Mint a key. The full secret is returned exactly once and never stored — only
 * its hash is, so a database dump cannot be replayed against the API. If the
 * holder loses it they mint another; there is no recovery, by design.
 */
export async function issueKey(input: {
  name: string
  organisationId: string
  createdByUserId: string
  scopes: ApiScope[]
  rateLimitPerMin?: number
  expiresAt?: Date | null
}): Promise<{ record: ApiKeyRecord; secret: string }> {
  const sql = await getSql()

  const prefix = `${KEY_PREFIX}_${randomBytes(4).toString('hex')}`
  const secret = `${prefix}_${randomBytes(24).toString('base64url')}`

  const scopes = input.scopes.filter((scope): scope is ApiScope =>
    (API_SCOPES as readonly string[]).includes(scope),
  )

  const record = await sql.one<ApiKeyRecord>(
    `INSERT INTO api_keys
       (name, prefix, key_hash, organisation_id, created_by_user_id, scopes, rate_limit_per_min, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, name, prefix, organisation_id, scopes, status, rate_limit_per_min,
               created_at, last_used_at, expires_at`,
    [
      input.name.trim(),
      prefix,
      sha256(secret),
      input.organisationId,
      input.createdByUserId,
      scopes,
      input.rateLimitPerMin ?? 120,
      input.expiresAt ?? null,
    ],
  )
  if (!record) throw new Error('Failed to issue API key')

  await publish({
    type: EVENT.ApiKeyIssued,
    aggregateType: 'api_key',
    aggregateId: record.id,
    actorUserId: input.createdByUserId,
    payload: { organisationId: input.organisationId, scopes, prefix },
  })

  return { record, secret }
}

export async function revokeKey(keyId: string, organisationId: string): Promise<boolean> {
  const sql = await getSql()
  // Scoped to the owning organisation: a key id is not a capability, and one
  // business must never be able to revoke another's integration.
  const row = await sql.one<{ id: string }>(
    `UPDATE api_keys SET status = 'revoked', revoked_at = now()
      WHERE id = $1 AND organisation_id = $2 AND status = 'active'
      RETURNING id`,
    [keyId, organisationId],
  )
  if (!row) return false

  await publish({
    type: EVENT.ApiKeyRevoked,
    aggregateType: 'api_key',
    aggregateId: keyId,
    payload: { organisationId },
  })
  return true
}

export async function listKeys(organisationId: string): Promise<ApiKeyRecord[]> {
  const sql = await getSql()
  return sql.query<ApiKeyRecord>(
    `SELECT id, name, prefix, organisation_id, scopes, status, rate_limit_per_min,
            created_at, last_used_at, expires_at
       FROM api_keys
      WHERE organisation_id = $1
      ORDER BY (status = 'active') DESC, created_at DESC`,
    [organisationId],
  )
}

// ---------------------------------------------------------------------------
// Authenticating a call
// ---------------------------------------------------------------------------

export type AuthFailure =
  | 'missing_credentials'
  | 'invalid_key'
  | 'revoked'
  | 'expired'
  | 'insufficient_scope'
  | 'rate_limited'

export interface AuthSuccess {
  ok: true
  key: ApiKeyRecord
  organisationId: string
}

export interface AuthRejected {
  ok: false
  reason: AuthFailure
  /** Seconds until the caller may retry — rate limiting only. */
  retryAfter?: number
}

/**
 * Resolve a bearer token to a key, then check it is allowed to do this.
 *
 * Order matters: identity, then validity, then permission, then quota. A
 * caller with a bad key must not learn anything about rate limits, and a
 * caller who is merely over quota must not be told their scopes are wrong.
 */
export async function authenticate(
  authorization: string | null,
  required: ApiScope,
): Promise<AuthSuccess | AuthRejected> {
  const token = bearerToken(authorization)
  if (!token) return { ok: false, reason: 'missing_credentials' }

  const sql = await getSql()
  const key = await sql.one<ApiKeyRecord & { status: 'active' | 'revoked' }>(
    `SELECT id, name, prefix, organisation_id, scopes, status, rate_limit_per_min,
            created_at, last_used_at, expires_at
       FROM api_keys WHERE key_hash = $1`,
    [sha256(token)],
  )

  if (!key) return { ok: false, reason: 'invalid_key' }
  if (key.status === 'revoked') return { ok: false, reason: 'revoked' }
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' }
  }
  if (!key.organisation_id) return { ok: false, reason: 'invalid_key' }
  if (!key.scopes.includes(required)) return { ok: false, reason: 'insufficient_scope' }

  const used = await sql.one<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM api_requests
      WHERE api_key_id = $1 AND created_at > now() - interval '1 minute'`,
    [key.id],
  )
  if ((used?.count ?? 0) >= key.rate_limit_per_min) {
    return { ok: false, reason: 'rate_limited', retryAfter: 60 }
  }

  return { ok: true, key, organisationId: key.organisation_id }
}

function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * Record the call. Append-only, and it is what the rate-limit window counts,
 * what the audit trail reads, and what any future metered billing bills from —
 * so it is written for every outcome, including the rejected ones.
 */
export async function recordRequest(input: {
  apiKeyId: string | null
  requestId: string
  method: string
  path: string
  status: number
  durationMs: number
}): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `INSERT INTO api_requests (api_key_id, request_id, method, path, status, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.apiKeyId,
      input.requestId,
      input.method,
      input.path.slice(0, 300),
      input.status,
      input.durationMs,
    ],
  )
  if (input.apiKeyId) {
    await sql.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [input.apiKeyId])
  }
}

/** Usage per key, for the partner console and for future metered billing. */
export async function keyUsage(organisationId: string, hours = 24) {
  const sql = await getSql()
  return sql.query<{ api_key_id: string; calls: number; errors: number; avg_ms: number }>(
    `SELECT r.api_key_id,
            COUNT(*)::int                                        AS calls,
            COUNT(*) FILTER (WHERE r.status >= 400)::int         AS errors,
            COALESCE(ROUND(AVG(r.duration_ms)), 0)::int          AS avg_ms
       FROM api_requests r
       JOIN api_keys k ON k.id = r.api_key_id
      WHERE k.organisation_id = $1
        AND r.created_at > now() - ($2 || ' hours')::interval
      GROUP BY r.api_key_id`,
    [organisationId, String(hours)],
  )
}
