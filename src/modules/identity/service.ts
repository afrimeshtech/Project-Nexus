import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { getSql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'
import { emailTransport, sendOtpEmail } from '@/modules/notifications/email'

/**
 * MODULE: identity
 *
 * Registration, authentication, sessions and RBAC (SAD "Authentication &
 * Identity"). Supports the two methods the SAD lists for launch:
 *   - Email + password
 *   - Phone number + OTP
 * Biometric and passkeys are deferred, but the session model below is
 * credential-agnostic so adding them touches only this module.
 *
 * Sessions are opaque random tokens, stored hashed. A stolen database dump
 * cannot be replayed into a live session, and revocation is immediate -
 * neither of which a stateless JWT gives us.
 */

const scryptAsync = promisify(scrypt)

export type UserRole =
  | 'consumer'
  | 'outlet'
  | 'merchant'
  | 'warehouse'
  | 'manufacturer'
  | 'delivery_partner'
  | 'platform_admin'
  | 'super_admin'
  | 'auditor'

export interface User {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role: UserRole
  status: 'pending' | 'active' | 'suspended' | 'rejected'
  phone_verified: boolean
  email_verified: boolean
  trust_score: number
  default_lat: number | null
  default_lng: number | null
  default_address: string | null
  city: string | null
  state: string | null
  country: string
  created_at: Date
}

/**
 * Cookie name for the session token. Declared here, beside the code that
 * mints and resolves the token, so the identity module owns the whole concept.
 */
export const SESSION_COOKIE_NAME = 'afrimesh_session'

const SESSION_DAYS = 30
const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const derived = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64)) as Buffer
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegisterInput {
  fullName: string
  phone?: string | null
  email?: string | null
  password?: string | null
  role?: UserRole
  lat?: number | null
  lng?: number | null
  address?: string | null
  city?: string | null
  state?: string | null
  /** Set only once the address has been proven with a one-time code. */
  emailVerified?: boolean
}

export async function registerUser(input: RegisterInput): Promise<User> {
  const sql = await getSql()
  const phone = normalisePhone(input.phone)
  const email = input.email?.trim().toLowerCase() || null

  if (!phone && !email) throw new ValidationError('A phone number or email address is required')

  const clash = await sql.one<{ id: string }>(
    `SELECT id FROM users WHERE ($1::text IS NOT NULL AND phone = $1) OR ($2::text IS NOT NULL AND email = $2)`,
    [phone, email],
  )
  if (clash) throw new ValidationError('An account already exists with those details')

  const passwordHash = input.password ? await hashPassword(input.password) : null

  const user = await sql.one<User>(
    `INSERT INTO users (full_name, phone, email, password_hash, role, default_lat, default_lng,
                        default_address, city, state, phone_verified, email_verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      input.fullName.trim(),
      phone,
      email,
      passwordHash,
      input.role ?? 'consumer',
      input.lat ?? null,
      input.lng ?? null,
      input.address ?? null,
      input.city ?? null,
      input.state ?? null,
      false,
      Boolean(input.emailVerified && email),
    ],
  )
  if (!user) throw new Error('Failed to create user')

  await publish({
    type: EVENT.UserRegistered,
    aggregateType: 'user',
    aggregateId: user.id,
    actorUserId: user.id,
    payload: { role: user.role, channel: phone ? 'phone' : 'email' },
  })

  await queueNotification({
    userId: user.id,
    title: 'Welcome to AfriMesh',
    body: 'Your account is ready. Find what you need, nearby.',
    category: 'account',
  })

  return user
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function authenticateWithPassword(
  identifier: string,
  password: string,
): Promise<User> {
  const sql = await getSql()
  const phone = normalisePhone(identifier)
  const email = identifier.trim().toLowerCase()

  const row = await sql.one<User & { password_hash: string | null }>(
    `SELECT * FROM users WHERE email = $1 OR phone = $2 LIMIT 1`,
    [email, phone],
  )

  // Constant-ish failure path: always run a hash comparison so a missing
  // account and a wrong password take a similar amount of time.
  const stored = row?.password_hash ?? 'scrypt$00$00'
  const ok = await verifyPassword(password, stored)

  if (!row || !ok) throw new AuthError('Those credentials did not match our records')
  if (row.status === 'suspended') throw new AuthError('This account has been suspended')

  await touchLogin(row.id)
  return stripSecret(row)
}

/**
 * Issue a one-time code. In development the transport is the console, so the
 * code is returned to the caller and shown in the UI; with a real SMS provider
 * configured it is delivered out of band and never returned.
 */
export async function requestOtp(
  destination: string,
  purpose: 'login' | 'register' | 'reset' = 'login',
): Promise<{ sent: true; destination: string; devCode?: string }> {
  const sql = await getSql()
  const dest = otpDestination(destination)
  const channel = isEmail(dest) ? 'email' : 'sms'
  const emailLive = channel === 'email' && emailTransport() === 'resend'

  // A code shown on screen is only acceptable on a developer's machine. On a
  // live site it would let anyone sign in as any address they can type - an
  // administrator's phone number included. Email was guarded; SMS has no live
  // transport at all yet, so on a production server phone codes are refused
  // outright rather than printed.
  const production = process.env.NODE_ENV === 'production'
  if (production && channel === 'email' && !emailLive) {
    throw new OtpDeliveryError('Email sign-in codes are not configured on this server.')
  }
  if (production && channel === 'sms') {
    throw new OtpDeliveryError(
      'Phone sign-in codes are not available yet. Sign in with your password or email instead.',
    )
  }

  const code = String(randomInt(100_000, 999_999))

  await sql.query(
    `INSERT INTO otp_codes (destination, channel, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
    [dest, channel, sha256(code), purpose, String(OTP_TTL_MINUTES)],
  )

  if (emailLive) {
    try {
      await sendOtpEmail(dest, code, purpose, OTP_TTL_MINUTES)
    } catch (err) {
      console.error('[otp] email delivery failed', err)
      throw new OtpDeliveryError('We could not email your code. Please try again.')
    }
  }

  await publish({
    type: EVENT.OtpIssued,
    aggregateType: 'otp',
    aggregateId: dest,
    payload: { purpose, channel },
  })

  const devMode =
    !production && !emailLive && (process.env.NOTIFICATION_TRANSPORT ?? 'console') === 'console'
  if (devMode) console.log(`[otp] ${dest} -> ${code} (${purpose})`)

  return devMode
    ? { sent: true, destination: dest, devCode: code }
    : { sent: true, destination: dest }
}

export async function verifyOtp(
  destination: string,
  code: string,
  purpose: 'login' | 'register' | 'reset' = 'login',
): Promise<boolean> {
  const sql = await getSql()
  const dest = otpDestination(destination)

  const row = await sql.one<{ id: string; attempts: number }>(
    `SELECT id, attempts FROM otp_codes
      WHERE destination = $1 AND purpose = $2 AND code_hash = $3
        AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [dest, purpose, sha256(code)],
  )

  if (!row) {
    await sql.query(
      `UPDATE otp_codes SET attempts = attempts + 1
        WHERE destination = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()`,
      [dest, purpose],
    )
    return false
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS)
    throw new AuthError('Too many attempts. Request a new code.')

  await sql.query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [row.id])
  return true
}

/**
 * Log in by phone + OTP, creating the account on first use.
 *
 * `created` distinguishes a first-ever sign-in from a returning one. Callers
 * need it because some things may only happen once, at the point a person
 * actually joins - crediting whoever invited them, for one. Without it the
 * caller would have to infer "new account" from timestamps, and get it wrong.
 */
export async function authenticateWithOtp(
  phoneRaw: string,
  code: string,
): Promise<{ user: User; created: boolean }> {
  const ok = await verifyOtp(phoneRaw, code, 'login')
  if (!ok) throw new AuthError('That code is incorrect or has expired')

  const sql = await getSql()
  const phone = normalisePhone(phoneRaw)
  let user = await sql.one<User>(`SELECT * FROM users WHERE phone = $1`, [phone])
  const created = !user

  if (!user) {
    user = await registerUser({ fullName: 'AfriMesh User', phone: phoneRaw })
  }
  await sql.query(`UPDATE users SET phone_verified = TRUE WHERE id = $1`, [user.id])
  await touchLogin(user.id)
  return { user: { ...user, phone_verified: true }, created }
}

/**
 * Log in by email + OTP, creating the account on first use - the email twin
 * of `authenticateWithOtp`. Proving you can read the inbox is what verifies
 * the address, so a successful code always marks it verified.
 */
export async function authenticateWithEmailOtp(
  emailRaw: string,
  code: string,
): Promise<{ user: User; created: boolean }> {
  const ok = await verifyOtp(emailRaw, code, 'login')
  if (!ok) throw new AuthError('That code is incorrect or has expired')

  const sql = await getSql()
  const email = emailRaw.trim().toLowerCase()
  let user = await sql.one<User>(`SELECT * FROM users WHERE email = $1`, [email])
  const created = !user

  if (!user) {
    user = await registerUser({ fullName: 'AfriMesh User', email, emailVerified: true })
  }
  if (user.status === 'suspended') throw new AuthError('This account has been suspended')
  await sql.query(`UPDATE users SET email_verified = TRUE WHERE id = $1`, [user.id])
  await touchLogin(user.id)
  return { user: { ...user, email_verified: true }, created }
}

/**
 * Refuse a registration before any code is sent, so a taken address is
 * reported at the first step rather than after the person has fetched a code.
 */
export async function assertContactAvailable(input: {
  phone?: string | null
  email?: string | null
}): Promise<void> {
  const sql = await getSql()
  const phone = normalisePhone(input.phone)
  const email = input.email?.trim().toLowerCase() || null
  const clash = await sql.one<{ id: string }>(
    `SELECT id FROM users WHERE ($1::text IS NOT NULL AND phone = $1) OR ($2::text IS NOT NULL AND email = $2)`,
    [phone, email],
  )
  if (clash) throw new ValidationError('An account already exists with those details')
}

async function touchLogin(userId: string) {
  const sql = await getSql()
  await sql.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId])
  await publish({
    type: EVENT.UserLoggedIn,
    aggregateType: 'user',
    aggregateId: userId,
    actorUserId: userId,
  })
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<string> {
  const sql = await getSql()
  const token = randomBytes(32).toString('base64url')
  await sql.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [userId, sha256(token), meta.userAgent ?? null, meta.ip ?? null, String(SESSION_DAYS)],
  )
  return token
}

export async function resolveSession(token: string | undefined): Promise<User | null> {
  if (!token) return null
  const sql = await getSql()
  const user = await sql.one<User>(
    `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  )
  if (!user || user.status === 'suspended') return null
  return user
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return
  const sql = await getSql()
  await sql.query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`, [sha256(token)])
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise Nigerian numbers to E.164. Users type 0803..., 234803..., +234803...
 * and all three must resolve to one account.
 */
export function isEmail(value: string): boolean {
  return value.includes('@')
}

/**
 * Where a one-time code goes, in the form it is stored under. Email is decided
 * first and explicitly: `normalisePhone` strips everything but digits, so an
 * address like "ada2@example.ng" would otherwise be stored as the "phone" "2"
 * and its code could never be matched.
 */
export function otpDestination(input: string): string {
  const trimmed = input.trim()
  if (isEmail(trimmed)) return trimmed.toLowerCase()
  return normalisePhone(trimmed) ?? trimmed.toLowerCase()
}

export function normalisePhone(input?: string | null): string | null {
  if (!input) return null
  const digits = input.replace(/[^\d+]/g, '')
  if (!digits) return null
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0')) return '+234' + digits.slice(1)
  if (digits.startsWith('234')) return '+' + digits
  if (/^\d{10}$/.test(digits)) return '+234' + digits
  return digits
}

function stripSecret(row: User & { password_hash?: string | null }): User {
  const { password_hash: _ignored, ...rest } = row
  return rest as User
}

export class ValidationError extends Error {}
export class AuthError extends Error {}
/** A code could not be delivered; safe to show the message to the person. */
export class OtpDeliveryError extends Error {}
