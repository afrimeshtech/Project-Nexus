import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'
import { listProductSlugs } from '@/modules/catalog/service'
import { listOrganisations } from '@/modules/organisations/service'

/**
 * The index a search engine reads.
 *
 * Three kinds of page are listed, and nothing else: the handful of static
 * pages, every product a seller actually stocks, and every verified shop.
 * Unverified shops are left out on purpose — the platform's own claim is that
 * a listing means a verified seller physically has the stock, and pointing a
 * crawler at businesses it has not yet vouched for undercuts that.
 *
 * Regenerated hourly rather than on every request: this is a few thousand rows
 * of database work and a crawler reads it a few times a day.
 */
/*
 * Built per request, not at build time.
 *
 * `revalidate` was the obvious choice — a crawler reads this a few times a day
 * and it is a few thousand rows of work — but any caching strategy short of
 * force-dynamic makes Next prerender the route during `next build`, and this
 * one queries the database. At build time there may be no database: in the
 * container image there certainly is not, and locally the embedded PGlite
 * allows a single process, so a build running alongside `npm run dev` fights
 * it for the lock and the build worker dies.
 *
 * A sitemap costing one query per crawl is a better trade than a build that
 * needs a live database to succeed.
 */
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/about'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]

  // A failure here should cost the sitemap, not the whole route: an empty
  // sitemap is a bad day for SEO, a 500 is a bad day for everyone.
  const [products, shops] = await Promise.all([
    listProductSlugs().catch(() => []),
    listOrganisations({ type: 'outlet', verification: 'verified', limit: 5_000 }).catch(() => []),
  ])

  return [
    ...staticPages,
    ...products.map((p) => ({
      url: absoluteUrl(`/product/${p.slug}`),
      lastModified: p.created_at,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...shops.map((s) => ({
      url: absoluteUrl(`/shop/${s.slug}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}
