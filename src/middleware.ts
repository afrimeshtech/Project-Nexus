import { NextResponse, type NextRequest } from 'next/server'

/**
 * Gates the consumer homepage behind `/showcase` for a visitor who has
 * neither a session nor been through the landing page before. Everything
 * else — `/search`, `/shop/[slug]`, `/login`, `/showcase` itself — is
 * reachable directly; only `/` redirects.
 *
 * Two separate signals, checked without touching the database (middleware
 * runs on the edge runtime, and the session/identity modules pull in the
 * Postgres driver, which does not run there):
 *   - `afrimesh_session` — the real session cookie. Its name is duplicated
 *     from `SESSION_COOKIE_NAME` in `src/modules/identity/service.ts` rather
 *     than imported, deliberately: importing that module here would pull the
 *     database client into the edge bundle. This only checks *presence*, not
 *     validity — an expired or forged cookie still reaches `/` and gets
 *     turned away by the page's own `currentUser()` check as it always has.
 *   - `afm_seen_landing` — set by `/enter` once a guest has actually clicked
 *     through the showcase, so returning guests are not shown the pitch on
 *     every visit, only once.
 */
const SESSION_COOKIE = 'afrimesh_session'
const SEEN_LANDING_COOKIE = 'afm_seen_landing'

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE)
  const hasSeenLanding = request.cookies.has(SEEN_LANDING_COOKIE)

  if (!hasSession && !hasSeenLanding) {
    const url = request.nextUrl.clone()
    url.pathname = '/showcase'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
