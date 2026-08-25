import { getSql, databaseDriver } from '@/db/client'

export const dynamic = 'force-dynamic'

/**
 * Liveness and readiness, for a load balancer or an orchestrator.
 *
 * "Managed cloud services ... Auto-scaling where appropriate ... Load
 * balancing" — CIM Volume III §11. None of that works without a probe: a
 * platform with no health endpoint gets traffic routed to instances that are
 * still starting, and stays in a broken state because nothing knows to pull
 * them out.
 *
 *   GET /api/health        liveness  — is the process up at all?
 *   GET /api/health?ready  readiness — can it actually serve, database included?
 *
 * The two are genuinely different. An instance whose database connection has
 * gone should be taken *out of rotation* (not ready) but not *restarted*
 * (still alive) — restarting it would not fix a database that is down, and a
 * crash loop across every instance turns a degraded platform into an outage.
 *
 * Deliberately unauthenticated and deliberately uninformative on failure: a
 * probe endpoint is reachable from outside, so it reports a state, never a
 * reason. The reason goes to our logs.
 */
export async function GET(request: Request): Promise<Response> {
  const wantsReadiness = new URL(request.url).searchParams.has('ready')

  if (!wantsReadiness) {
    return json({ status: 'alive' }, 200)
  }

  const started = Date.now()
  try {
    const sql = await getSql()
    await sql.query('SELECT 1')
    return json(
      {
        status: 'ready',
        database: { driver: databaseDriver(), latencyMs: Date.now() - started },
      },
      200,
    )
  } catch (err) {
    console.error('[health] readiness probe failed', err)
    return json({ status: 'not_ready' }, 503)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
