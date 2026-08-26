import { NextResponse, type NextRequest } from 'next/server'
import { internalPath } from '@/lib/forms'

/**
 * The showcase's one exit into the real app. A plain link straight to `/`
 * would work for this visit, but the next one would just bounce the same
 * guest back to `/showcase` again — middleware only skips the redirect once
 * `afm_seen_landing` exists. This route sets that cookie and forwards on, so
 * "click through once" actually means once.
 */
export async function GET(request: NextRequest) {
  const next = internalPath.parse(request.nextUrl.searchParams.get('next') ?? '/')
  const response = NextResponse.redirect(new URL(next, request.url))
  response.cookies.set('afm_seen_landing', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}
