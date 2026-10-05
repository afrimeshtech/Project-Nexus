import { z } from 'zod'
import { LAUNCH_FULFILMENT } from '@/lib/launch-fulfilment'

/**
 * Input validation for server actions.
 *
 * A server action is a public HTTP endpoint. Anything arriving in a FormData
 * is attacker-controlled: field names can be missing, duplicated, or carry
 * values the UI would never produce. Casting with `String(x)` and `Number(x)`
 * accepts all of it and fails somewhere deeper, usually as a database error.
 *
 * Every action parses its input through a schema declared next to it, so the
 * boundary is explicit and the failure message is one a person can act on.
 */

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Parse a FormData against a schema, returning the first human-readable
 * problem rather than a field-by-field error map — these forms are small
 * enough that one clear sentence beats a structure the UI has to render.
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): ParseResult<z.infer<S>> {
  const raw: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    // Ignore File entries: no action in this app accepts an upload, and
    // silently coercing one to "[object File]" would be worse than dropping it.
    if (typeof value === 'string') raw[key] = value
  }

  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  const issue = result.error.issues[0]
  return { ok: false, error: issue?.message ?? 'Please check the form and try again.' }
}

// ---------------------------------------------------------------------------
// Reusable field schemas
//
// The messages are user-facing, so they are written as instructions rather
// than as type descriptions ("Enter your full name", not "Expected string").
// ---------------------------------------------------------------------------

export const uuid = (label: string) => z.string().uuid({ message: `That ${label} is not valid.` })

export const requiredText = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required.` })
    .max(max, { message: `${label} is too long.` })

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null))

/** A quantity of goods. Never negative, never fractional. */
export const quantity = (label = 'Quantity', min = 0) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .int({ message: `${label} must be a whole number.` })
    .min(min, { message: `${label} cannot be less than ${min}.` })
    .max(1_000_000, { message: `${label} is unrealistically large.` })

/**
 * An amount in naira as typed by a person. Kept in major units here and
 * converted to minor units by the caller, so the conversion happens once, at
 * a known place.
 */
export const nairaAmount = (label = 'Amount', min = 0) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .min(min, { message: `${label} must be at least ₦${min.toLocaleString()}.` })
    .max(50_000_000, { message: `${label} exceeds the single-transaction limit.` })
    .refine((value) => Number.isFinite(value), { message: `${label} is not a valid amount.` })

/** Nigerian numbers arrive in several shapes; normalisation happens later. */
export const phone = z
  .string()
  .trim()
  .min(7, { message: 'Enter a valid phone number.' })
  .max(20, { message: 'Enter a valid phone number.' })
  .regex(/^[\d+][\d\s()-]*$/, { message: 'A phone number can only contain digits.' })

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: 'Enter a valid email address.' })

export const latitude = z.coerce
  .number({ message: 'Latitude must be a number.' })
  .min(-90, { message: 'Latitude must be between -90 and 90.' })
  .max(90, { message: 'Latitude must be between -90 and 90.' })

export const longitude = z.coerce
  .number({ message: 'Longitude must be a number.' })
  .min(-180, { message: 'Longitude must be between -180 and 180.' })
  .max(180, { message: 'Longitude must be between -180 and 180.' })

export const paymentMethod = z.enum(['wallet', 'card', 'bank_transfer', 'ussd', 'qr'], {
  message: 'Choose a payment method.',
})

// FUTURE-DELIVERY: narrowed to what launches - see lib/launch-fulfilment.ts.
export const fulfilment = z.enum(LAUNCH_FULFILMENT, {
  message: 'Choose how you will receive your order.',
})

/**
 * FUTURE-DASHBOARD: the network launches with the retail outlet tier only.
 *
 * Merchant, dealer warehouse, manufacturer and delivery partner each have a
 * working dashboard behind them — the pages, services and schema are all still
 * here and still compile. What is switched off is the way in: this enum is what
 * the registration form posts against, so narrowing it is what makes those
 * tiers unregisterable rather than merely hidden.
 *
 * To bring one back, add its value here and uncomment its entry in
 * components/partner/BusinessForm.tsx. `grep -rn FUTURE-DASHBOARD src` lists
 * every switch that has to move together.
 */
export const orgType = z.enum(
  [
    'outlet',
    // 'merchant',
    // 'warehouse',
    // 'manufacturer',
    // 'logistics',
  ],
  {
    message: 'Choose the kind of business you run.',
  },
)

/**
 * A rewards invitation code, on the two paths that create an account.
 *
 * Optional and never rejected for its shape: the code is checked against the
 * database when the account is created, and a mistyped invitation must cost
 * someone a reward at worst, never their sign-up.
 */
export const referralCode = z.string().trim().max(24).optional().or(z.literal(''))

export const stars = z.coerce
  .number({ message: 'Choose a rating.' })
  .int()
  .min(1, { message: 'A rating must be between 1 and 5.' })
  .max(5, { message: 'A rating must be between 1 and 5.' })

/**
 * A relative path used for post-login redirects. Rejecting absolute URLs stops
 * `?next=https://evil.example` turning our sign-in page into an open redirect.
 */
export const internalPath = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
    return value
  })

export { z }
