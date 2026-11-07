import { NextResponse } from 'next/server'
import { CIRCULAR_LAUNCHED } from '@/lib/launch-circular'

export const dynamic = 'force-dynamic'

/**
 * AfriMesh Circular's reserved API path. The specification writes its
 * endpoints as /api/circular/{resources,listings,requirements,discover,
 * matches,enquiries,transactions}/... and asks for them to be mapped onto the
 * existing routing and conventions "rather than creating a competing API
 * structure" (§8) - so they live under the v1 API, here.
 *
 * Every method answers 501 until launch, in the public API's error shape.
 *
 * FUTURE-CIRCULAR: replace this catch-all with one route per §8 endpoint
 * through the v1 endpoint() wrapper (API-key auth, scopes, rate limits),
 * with circular:* scopes in modules/api. Business-facing screens use server
 * actions over modules/circular/service.ts, like the rest of the app.
 */
function notYet() {
  return NextResponse.json(
    {
      error: {
        code: CIRCULAR_LAUNCHED ? 'not_found' : 'not_implemented',
        message: CIRCULAR_LAUNCHED ? 'No such Circular endpoint.' : 'AfriMesh Circular is not available yet.',
      },
    },
    { status: CIRCULAR_LAUNCHED ? 404 : 501, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const GET = notYet
export const POST = notYet
export const PUT = notYet
export const PATCH = notYet
export const DELETE = notYet
