/**
 * The site's public origin.
 *
 * Needed by anything that has to emit an absolute URL — the sitemap, robots,
 * and the canonical and og: tags — because those are read off-site, where a
 * relative path means nothing.
 *
 * Server-only, deliberately: a page already knows its own origin, so this has
 * no business being shipped to the browser. The conventions test enforces that
 * no environment variable carries the browser-exposed prefix — and it greps
 * for that prefix as a literal string, so it is not spelled out here.
 */
const FALLBACK = 'https://afrimesh.africa'

export function siteUrl(): string {
  const configured = process.env.SITE_URL?.trim()
  if (!configured) return FALLBACK
  // A trailing slash here doubles up on every joined path.
  return configured.replace(/\/+$/, '')
}

/** Absolute URL for a path that begins with a slash. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`
}
