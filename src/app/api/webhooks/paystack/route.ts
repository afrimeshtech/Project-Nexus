import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  settlePaymentByProviderRef,
  failPaymentByProviderRef,
  type SettlementOutcome,
} from '@/modules/orders/service'

/**
 * Paystack webhook — the only thing on this platform that turns an external
 * payment into a confirmed order.
 *
 * The redirect back from Paystack does not settle anything. A customer who
 * closes the tab after paying never loads it, and anyone at all can request it
 * with any reference. This route is the source of truth because it is the only
 * one that arrives signed.
 *
 * Three properties matter here, in order:
 *
 *   1. Authenticity. The body is HMAC-SHA512'd with our secret key. An
 *      unsigned or wrongly signed request is rejected before it is parsed.
 *   2. Idempotency. Paystack retries — on timeout, on any non-2xx, and
 *      sometimes anyway. Every retry must be a no-op, or one payment credits a
 *      wallet twice. Claimed inside the settling transaction; see
 *      settlePaymentByProviderRef.
 *   3. Speed. Paystack expects 200 within a few seconds and retries if it does
 *      not get one. Everything here is one transaction and no outbound calls.
 *
 * A signature proves who sent the message, not that the message is true, so
 * the amount in the payload is checked against the amount we asked for before
 * any money moves.
 */

// Node, not Edge: this needs node:crypto and the pg driver.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVIDER = 'paystack'

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) {
    // Not configured is not the caller's fault, and a 500 makes Paystack retry
    // later — which is what we want if this is a misconfigured deploy.
    console.error('[paystack:webhook] PAYSTACK_SECRET_KEY is not set; cannot verify signatures')
    return new Response('not configured', { status: 500 })
  }

  // The raw body, before any parsing. The signature is over exact bytes, and
  // JSON.parse + re-stringify does not reproduce them.
  const raw = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  if (!verifySignature(raw, signature, secret)) {
    console.warn('[paystack:webhook] rejected a request with an invalid signature')
    return new Response('invalid signature', { status: 401 })
  }

  let event: PaystackEvent
  try {
    event = JSON.parse(raw) as PaystackEvent
  } catch {
    // Signed but unparseable. Retrying will not help, so do not ask for one.
    console.error('[paystack:webhook] signed payload was not JSON')
    return new Response('bad payload', { status: 400 })
  }

  const reference = event.data?.reference
  const eventId = `${event.event}:${event.data?.id ?? reference ?? 'unknown'}`

  if (!reference) {
    console.warn(`[paystack:webhook] ${event.event} carried no reference; ignoring`)
    return ack('ignored')
  }

  try {
    switch (event.event) {
      case 'charge.success': {
        const outcome = await settlePaymentByProviderRef(
          reference,
          { amount: event.data?.amount ?? 0, currency: event.data?.currency ?? '' },
          { provider: PROVIDER, id: eventId, type: event.event },
        )
        log(event.event, reference, outcome)
        return ack(outcome)
      }

      /*
       * Paystack only fires these for channels that can fail asynchronously
       * (a reversed transfer, a dispute upheld). A card that is simply
       * declined never produces a webhook at all — the payment stays pending
       * until the customer retries or the reservation lapses, which is the
       * correct resting state for money we never received.
       */
      case 'charge.failed':
      case 'transfer.failed':
      case 'transfer.reversed': {
        const outcome = await failPaymentByProviderRef(
          reference,
          event.data?.gateway_response ?? 'The payment did not go through',
          { provider: PROVIDER, id: eventId, type: event.event },
        )
        log(event.event, reference, outcome)
        return ack(outcome)
      }

      default:
        // Acknowledged, deliberately unhandled. Returning non-2xx for an event
        // we do not care about would have Paystack retry it for days.
        return ack('ignored')
    }
  } catch (err) {
    // A 500 asks Paystack to redeliver, which is what we want: the settling
    // transaction rolled back, so the retry has real work to do.
    console.error(`[paystack:webhook] ${event.event} for ${reference} failed`, err)
    return new Response('settlement failed', { status: 500 })
  }
}

/**
 * Constant-time signature check.
 *
 * `timingSafeEqual` throws on a length mismatch, so the lengths are compared
 * first — and that comparison is safe to short-circuit, since the digest
 * length is fixed and public.
 */
function verifySignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret).update(raw, 'utf8').digest('hex')
  if (signature.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Every handled outcome is a 200.
 *
 * `unknown_reference` and `amount_mismatch` are terminal problems on our side
 * or bad data on theirs; neither is fixed by Paystack sending the same event
 * again, and asking it to would bury the real signal in retries. They are
 * logged loudly instead.
 */
function ack(outcome: SettlementOutcome | 'ignored'): Response {
  return new Response(JSON.stringify({ received: true, outcome }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function log(eventName: string, reference: string, outcome: SettlementOutcome): void {
  const line = `[paystack:webhook] ${eventName} ${reference} -> ${outcome}`
  if (outcome === 'amount_mismatch' || outcome === 'unknown_reference') console.error(line)
  else console.log(line)
}

interface PaystackEvent {
  event: string
  data?: {
    id?: number
    reference?: string
    amount?: number
    currency?: string
    status?: string
    gateway_response?: string
  }
}
