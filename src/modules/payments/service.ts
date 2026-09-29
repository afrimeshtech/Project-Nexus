import { randomBytes } from 'node:crypto'
import { type Sql } from '@/db/client'

/**
 * MODULE: payments
 *
 * "The payment service should abstract multiple providers behind a common
 * interface... The design allows regional payment providers to be added
 * without changing business logic." - System Architecture Document.
 *
 * So the rest of the platform only ever sees `PaymentGateway`. Paystack,
 * Flutterwave, a bank's USSD rail or a QR scheme each become one adapter
 * implementing `charge`/`refund`; no order, wallet or inventory code changes.
 *
 * Methods supported at MVP: wallet, bank transfer, card, USSD, QR.
 * Split payments and scheduled payments are deferred (PRD §10, future).
 */

export type PaymentMethod = 'wallet' | 'bank_transfer' | 'card' | 'ussd' | 'qr'

export interface ChargeRequest {
  amount: number // minor units
  currency: string
  method: PaymentMethod
  reference: string
  customer: { userId: string; email?: string | null; phone?: string | null }
  metadata?: Record<string, unknown>
}

/**
 * The three outcomes a charge can have.
 *
 * `pending` is the one that makes real providers expressible. A synchronous
 * gateway (the mock, or a wallet debit) answers succeeded/failed inline. Every
 * external provider answers `pending`: it has accepted the attempt and handed
 * back somewhere to send the customer, and the money — if it ever arrives —
 * is reported later by webhook. Collapsing that into `success: true` credits a
 * wallet for money that has not arrived; collapsing it into `success: false`
 * fails a legitimate order. Neither is acceptable, so it gets its own state.
 */
export type ChargeStatus = 'succeeded' | 'failed' | 'pending'

export interface ChargeResult {
  status: ChargeStatus
  providerRef: string
  failureReason?: string
  /** Set when the provider needs the customer to complete an action. */
  actionRequired?: { kind: 'redirect' | 'ussd_code' | 'qr'; value: string }
}

export interface PaymentGateway {
  readonly name: string
  supports(method: PaymentMethod): boolean
  charge(request: ChargeRequest): Promise<ChargeResult>
  refund(providerRef: string, amount: number): Promise<ChargeResult>
}

// ---------------------------------------------------------------------------
// Mock gateway - the default for development and demos.
// ---------------------------------------------------------------------------

const mockGateway: PaymentGateway = {
  name: 'mock',
  supports: () => true,
  async charge(request) {
    const providerRef = `MOCK-${randomBytes(6).toString('hex').toUpperCase()}`
    // Deterministic failure hook so the failure path stays exercisable:
    // any amount ending in .13 is declined.
    if (request.amount % 100 === 13) {
      return { status: 'failed', providerRef, failureReason: 'Declined by issuer' }
    }
    if (request.method === 'ussd') {
      return {
        status: 'succeeded',
        providerRef,
        actionRequired: { kind: 'ussd_code', value: '*737*000#' },
      }
    }
    return { status: 'succeeded', providerRef }
  },
  async refund(providerRef) {
    return { status: 'succeeded', providerRef: `${providerRef}-RFND` }
  },
}

// ---------------------------------------------------------------------------
// Paystack
// ---------------------------------------------------------------------------

/**
 * Paystack, for NGN card / bank transfer / USSD / QR.
 *
 * The flow is deliberately three-legged, and `charge()` only does the first
 * leg:
 *
 *   1. here — /transaction/initialize returns an authorization_url. No money
 *      has moved. We answer `pending`, so the payment row stays pending and
 *      the order stays in `pending_payment`.
 *   2. the customer pays on Paystack's own page. Card details never touch this
 *      server, which is what keeps us in PCI SAQ-A scope. Do not build a card
 *      form against this adapter.
 *   3. Paystack POSTs charge.success to /api/webhooks/paystack, which verifies
 *      the signature and completes the payment. The deposit and the escrow
 *      move live there — see settlePaymentByProviderRef in modules/orders.
 *
 * Every amount crossing this boundary is minor units (kobo), which is what
 * Paystack expects and what the platform stores. No conversion, no rounding.
 */

const PAYSTACK_API = 'https://api.paystack.co'

/** Paystack calls them channels; we call them methods. */
const PAYSTACK_CHANNEL: Record<PaymentMethod, string | null> = {
  card: 'card',
  bank_transfer: 'bank_transfer',
  ussd: 'ussd',
  qr: 'qr',
  // A wallet debit never reaches a gateway — orders/service settles it
  // against the ledger directly.
  wallet: null,
}

function paystackSecret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new PaymentConfigError(
      'PAYMENT_PROVIDER is "paystack" but PAYSTACK_SECRET_KEY is not set. ' +
        'Refusing to start: an unauthenticated gateway cannot take payment.',
    )
  }
  return key
}

interface PaystackEnvelope<T> {
  status: boolean
  message?: string
  data?: T
}

async function paystackFetch<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<PaystackEnvelope<T>> {
  // A gateway that hangs must not hang the order transaction with it.
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${paystackSecret()}`,
      'content-type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(Number(process.env.PAYSTACK_TIMEOUT_MS ?? 15_000)),
    cache: 'no-store',
  })

  const text = await response.text()
  let parsed: PaystackEnvelope<T>
  try {
    parsed = JSON.parse(text) as PaystackEnvelope<T>
  } catch {
    throw new Error(`Paystack returned ${response.status} with a non-JSON body`)
  }
  if (!response.ok) {
    throw new Error(`Paystack ${path} failed (${response.status}): ${parsed.message ?? text}`)
  }
  return parsed
}

const paystackGateway: PaymentGateway = {
  name: 'paystack',

  supports(method) {
    return PAYSTACK_CHANNEL[method] !== null
  },

  async charge(request) {
    const channel = PAYSTACK_CHANNEL[request.method]
    if (!channel) {
      return {
        status: 'failed',
        providerRef: request.reference,
        failureReason: `Paystack cannot take a ${request.method} payment`,
      }
    }

    /*
     * Paystack requires an email and will reject the initialize without one.
     * A buyer who signed up by phone alone has none, so the platform supplies
     * a routable-looking placeholder on its own domain rather than failing the
     * order — Paystack only uses it to key its own customer record and to send
     * a receipt, and a bounced receipt is a better outcome than a blocked
     * checkout.
     */
    const email = request.customer.email?.trim() || `${request.customer.userId}@users.afrimesh.ng`

    try {
      const result = await paystackFetch<{
        authorization_url: string
        access_code: string
        reference: string
      }>('/transaction/initialize', {
        method: 'POST',
        body: {
          email,
          amount: request.amount,
          currency: request.currency,
          // Our own reference, so the webhook can find the payment row it
          // belongs to without trusting anything else in the payload.
          reference: request.reference,
          channels: [channel],
          callback_url: callbackUrl(),
          metadata: { ...request.metadata, userId: request.customer.userId },
        },
      })

      if (!result.status || !result.data?.authorization_url) {
        return {
          status: 'failed',
          providerRef: request.reference,
          failureReason: result.message ?? 'Paystack declined to start this payment',
        }
      }

      return {
        status: 'pending',
        providerRef: result.data.reference || request.reference,
        actionRequired: { kind: 'redirect', value: result.data.authorization_url },
      }
    } catch (err) {
      // A network failure is not a decline. The payment stays pending and the
      // customer can retry; nothing has been charged.
      console.error('[paystack] initialize failed', err)
      return {
        status: 'failed',
        providerRef: request.reference,
        failureReason: 'We could not reach the payment provider. Please try again.',
      }
    }
  },

  async refund(providerRef, amount) {
    try {
      const result = await paystackFetch<{ status: string }>('/refund', {
        method: 'POST',
        body: { transaction: providerRef, amount },
      })
      if (!result.status) {
        return {
          status: 'failed',
          providerRef,
          failureReason: result.message ?? 'Paystack rejected the refund',
        }
      }
      // Paystack refunds settle asynchronously too, but the platform has
      // already returned the money from escrow by the time this is called —
      // this only reconciles the provider side.
      return { status: 'succeeded', providerRef }
    } catch (err) {
      console.error('[paystack] refund failed', err)
      return { status: 'failed', providerRef, failureReason: 'Refund could not be submitted' }
    }
  },
}

/**
 * Where Paystack sends the customer after they finish paying.
 *
 * This is a convenience, never the source of truth: a customer who closes the
 * tab never reaches it, and anyone can hit it with any reference. Only the
 * webhook settles a payment.
 */
function callbackUrl(): string | undefined {
  const site = process.env.SITE_URL
  return site ? `${site.replace(/\/$/, '')}/orders/paystack/return` : undefined
}

/**
 * Ask Paystack directly what happened to a reference.
 *
 * Used by the return page, and as the reconciliation path for a webhook that
 * never arrived. Verify is authoritative in a way the redirect is not.
 */
export async function verifyPaystackTransaction(reference: string): Promise<{
  paid: boolean
  amount: number
  currency: string
  gatewayResponse?: string
}> {
  const result = await paystackFetch<{
    status: string
    amount: number
    currency: string
    gateway_response?: string
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' })

  return {
    paid: result.status === true && result.data?.status === 'success',
    amount: result.data?.amount ?? 0,
    currency: result.data?.currency ?? '',
    gatewayResponse: result.data?.gateway_response,
  }
}

const GATEWAYS: Record<string, PaymentGateway> = {
  mock: mockGateway,
  paystack: paystackGateway,
}

export class PaymentConfigError extends Error {}

/**
 * Resolve the configured gateway, or refuse to start.
 *
 * This used to end `?? mockGateway`, which meant a production deployment with
 * PAYMENT_PROVIDER=paystack — a name with no adapter behind it — silently fell
 * back to the mock and settled every order successfully having taken no money.
 * No error, no warning, no failed request to notice. A misconfiguration that
 * gives away goods is not a default worth having, so an unrecognised provider
 * now throws.
 *
 * `mock` has to be asked for by name. Nothing reaches it by accident.
 */
export function gateway(): PaymentGateway {
  const configured = process.env.PAYMENT_PROVIDER ?? 'mock'
  const found = GATEWAYS[configured]
  if (!found) {
    throw new PaymentConfigError(
      `PAYMENT_PROVIDER is "${configured}", which has no adapter. ` +
        `Available: ${Object.keys(GATEWAYS).join(', ')}. ` +
        `Refusing to fall back to the mock gateway, which would settle orders without taking payment.`,
    )
  }
  // Credentials are checked here rather than at the first charge, so a
  // deployment missing its key fails on the health probe instead of at a
  // customer's checkout.
  if (found.name === 'paystack') {
    paystackSecret()
    if (!process.env.SITE_URL) {
      throw new PaymentConfigError(
        'PAYMENT_PROVIDER is "paystack" but SITE_URL is not set. Paystack needs an ' +
          'absolute callback URL to return the customer to after paying.',
      )
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// Payment records
// ---------------------------------------------------------------------------

export interface Payment {
  id: string
  order_id: string | null
  payer_user_id: string
  method: PaymentMethod
  provider: string
  provider_ref: string | null
  amount: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  failure_reason: string | null
  credit_owner_type: 'user' | 'organisation' | null
  credit_owner_id: string | null
  created_at: Date
  completed_at: Date | null
}

export async function createPayment(
  tx: Sql,
  input: {
    orderId: string | null
    payerUserId: string
    method: PaymentMethod
    amount: number
    currency: string
    /** Where to credit on settlement. Defaults to the payer's own wallet. */
    creditOwner?: { type: 'user' | 'organisation'; id: string }
  },
): Promise<Payment> {
  const row = await tx.one<Payment>(
    `INSERT INTO payments
       (order_id, payer_user_id, method, provider, amount, currency,
        credit_owner_type, credit_owner_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.orderId,
      input.payerUserId,
      input.method,
      gateway().name,
      input.amount,
      input.currency,
      input.creditOwner?.type ?? null,
      input.creditOwner?.id ?? null,
    ],
  )
  if (!row) throw new Error('Failed to create payment')
  return row
}

export async function markPayment(
  tx: Sql,
  paymentId: string,
  status: 'succeeded' | 'failed' | 'refunded',
  detail: { providerRef?: string | null; failureReason?: string | null } = {},
): Promise<void> {
  // Every status this function accepts is terminal, so the payment is always
  // being completed. (An earlier version also handled 'pending' here and used
  // $2 in two different type contexts, which PostgreSQL cannot deduce a type
  // for - `text versus payment_status`.)
  await tx.query(
    `UPDATE payments
        SET status = $2,
            provider_ref = COALESCE($3, provider_ref),
            failure_reason = $4,
            completed_at = now()
      WHERE id = $1`,
    [paymentId, status, detail.providerRef ?? null, detail.failureReason ?? null],
  )
}

/**
 * Record the provider's reference on a payment that is still pending.
 *
 * Separate from `markPayment` on purpose: that function is for terminal states
 * and stamps `completed_at`. A pending payment has a reference but no outcome,
 * and stamping it complete would make an unpaid order look settled.
 */
export async function attachProviderRef(
  tx: Sql,
  paymentId: string,
  providerRef: string,
): Promise<void> {
  await tx.query(`UPDATE payments SET provider_ref = $2 WHERE id = $1`, [paymentId, providerRef])
}

export async function findPaymentByProviderRef(
  tx: Sql,
  providerRef: string,
): Promise<Payment | null> {
  return tx.one<Payment>(`SELECT * FROM payments WHERE provider_ref = $1`, [providerRef])
}

/**
 * Move a payment out of `pending` and report whether this caller is the one
 * that did it.
 *
 * The guard is the WHERE clause, not a prior SELECT. Two concurrent deliveries
 * of the same webhook both read `status = 'pending'` if they check first and
 * update second, and both then credit the wallet. Here the database decides:
 * exactly one UPDATE matches a pending row, and every other caller gets no row
 * back and does nothing.
 */
export async function claimPendingPayment(
  tx: Sql,
  paymentId: string,
  status: 'succeeded' | 'failed',
  detail: { providerRef?: string | null; failureReason?: string | null } = {},
): Promise<boolean> {
  const row = await tx.one<{ id: string }>(
    `UPDATE payments
        SET status = $2,
            provider_ref = COALESCE($3, provider_ref),
            failure_reason = $4,
            completed_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [paymentId, status, detail.providerRef ?? null, detail.failureReason ?? null],
  )
  return row !== null
}

/**
 * Take ownership of a provider event, once.
 *
 * Providers retry webhooks — on a timeout, on a non-2xx, and sometimes for no
 * reason at all. The unique constraint makes the first delivery the only one
 * that does any work. This is claimed inside the settling transaction, so a
 * crash halfway through rolls the claim back with everything else and the
 * retry is free to try again.
 */
export async function claimWebhookEvent(
  tx: Sql,
  provider: string,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const row = await tx.one<{ id: string }>(
    `INSERT INTO webhook_events (provider, event_id, event_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [provider, eventId, eventType],
  )
  return row !== null
}

export async function paymentsForOrder(tx: Sql, orderId: string): Promise<Payment[]> {
  return tx.query<Payment>(`SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC`, [
    orderId,
  ])
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  wallet: 'AfriMesh Wallet',
  bank_transfer: 'Bank transfer',
  card: 'Debit card',
  ussd: 'USSD',
  qr: 'QR payment',
}
