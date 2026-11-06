import { NextResponse } from 'next/server'
import { PRODUCTDNA_LAUNCHED } from '@/lib/launch-productdna'

export const dynamic = 'force-dynamic'

/**
 * The ProductDNA API's reserved base path (AFRI-PDNA-TIS-001 §6):
 * /api/v1/productdna/{manufacturers,products,batches,manifests,serials,
 * verify,observations,sales,returns,inventory,shipments}/...
 *
 * Every method answers 501 until launch, in the public API's error shape, so
 * an integrator probing early gets a clear "not yet" rather than a 404 that
 * reads like a wrong URL.
 *
 * FUTURE-PRODUCTDNA: replace this catch-all with one route per §6 endpoint,
 * each through the v1 endpoint() wrapper (API-key auth, scopes, rate limits,
 * request ids) with new productdna:* scopes in modules/api, plus manufacturer
 * authentication and idempotency keys on every write (§6, §13).
 */
function notYet() {
  return NextResponse.json(
    {
      error: {
        code: PRODUCTDNA_LAUNCHED ? 'not_found' : 'not_implemented',
        message: PRODUCTDNA_LAUNCHED
          ? 'No such ProductDNA endpoint.'
          : 'ProductDNA is not available yet.',
      },
    },
    { status: PRODUCTDNA_LAUNCHED ? 404 : 501, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const GET = notYet
export const POST = notYet
export const PUT = notYet
export const PATCH = notYet
export const DELETE = notYet
