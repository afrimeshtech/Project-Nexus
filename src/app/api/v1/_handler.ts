import { randomUUID } from 'node:crypto'
import { authenticate, recordRequest, type ApiScope, type AuthFailure } from '@/modules/api/service'

/**
 * The one way an API/v1 endpoint is written.
 *
 * Authentication, scope checking, rate limiting, error shaping, timing and the
 * audit record all happen here — not in each route. A cross-cutting check that
 * every endpoint has to remember is a check the next endpoint will forget, and
 * on a public API that forgetting is a breach rather than a bug.
 *
 * The envelope is deliberately boring and identical on every response:
 *
 *   success  { "data": ..., "meta": { "requestId": "..." } }
 *   failure  { "error": { "code": "...", "message": "..." },
 *              "meta": { "requestId": "..." } }
 *
 * A client that can parse one response can parse all of them, and `requestId`
 * appears in both the body and the `X-Request-Id` header so a support
 * conversation can start with one string.
 */

export interface ApiContext {
  organisationId: string
  requestId: string
  searchParams: URLSearchParams
  request: Request
}

type Handler = (ctx: ApiContext) => Promise<unknown>

const FAILURES: Record<AuthFailure, { status: number; code: string; message: string }> = {
  missing_credentials: {
    status: 401,
    code: 'missing_credentials',
    message: 'Send your key as an Authorization: Bearer header.',
  },
  invalid_key: {
    status: 401,
    code: 'invalid_key',
    message: 'That API key is not recognised.',
  },
  revoked: {
    status: 401,
    code: 'key_revoked',
    message: 'That API key has been revoked. Issue a new one from your dashboard.',
  },
  expired: {
    status: 401,
    code: 'key_expired',
    message: 'That API key has expired. Issue a new one from your dashboard.',
  },
  insufficient_scope: {
    status: 403,
    code: 'insufficient_scope',
    message: 'This key does not carry the scope required for this endpoint.',
  },
  rate_limited: {
    status: 429,
    code: 'rate_limited',
    message: 'Rate limit exceeded for this key. Retry in a minute.',
  },
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function endpoint(scope: ApiScope, handler: Handler) {
  return async function route(request: Request): Promise<Response> {
    const started = Date.now()
    const requestId = randomUUID()
    const url = new URL(request.url)
    const path = url.pathname

    const auth = await authenticate(request.headers.get('authorization'), scope)

    if (!auth.ok) {
      const failure = FAILURES[auth.reason]
      // Rejected calls are logged too: an audit trail that only records
      // successes is no use for spotting someone probing the surface.
      await recordRequest({
        apiKeyId: null,
        requestId,
        method: request.method,
        path,
        status: failure.status,
        durationMs: Date.now() - started,
      })
      return json(
        { error: { code: failure.code, message: failure.message }, meta: { requestId } },
        failure.status,
        requestId,
        auth.retryAfter,
      )
    }

    try {
      const data = await handler({
        organisationId: auth.organisationId,
        requestId,
        searchParams: url.searchParams,
        request,
      })

      await recordRequest({
        apiKeyId: auth.key.id,
        requestId,
        method: request.method,
        path,
        status: 200,
        durationMs: Date.now() - started,
      })
      return json({ data, meta: { requestId } }, 200, requestId)
    } catch (err) {
      const known = err instanceof ApiError
      const status = known ? err.status : 500
      // An unexpected failure must never leak a stack trace or a SQL string to
      // a third party; it goes to our logs and the caller gets a request id.
      if (!known) console.error(`[api] ${requestId} ${request.method} ${path}`, err)

      await recordRequest({
        apiKeyId: auth.key.id,
        requestId,
        method: request.method,
        path,
        status,
        durationMs: Date.now() - started,
      })
      return json(
        {
          error: {
            code: known ? err.code : 'internal_error',
            message: known ? err.message : 'The request could not be completed.',
          },
          meta: { requestId },
        },
        status,
        requestId,
      )
    }
  }
}

function json(body: unknown, status: number, requestId: string, retryAfter?: number): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': requestId,
    // A public API response is per-key and must never be shared by a cache.
    'cache-control': 'no-store',
  }
  if (retryAfter) headers['retry-after'] = String(retryAfter)
  return new Response(JSON.stringify(body, null, 2), { status, headers })
}

/** A bounded page size, so one call cannot ask for the whole database. */
export function pageSize(params: URLSearchParams, fallback = 50, max = 200): number {
  const raw = Number(params.get('limit'))
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.min(Math.floor(raw), max)
}
