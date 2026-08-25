import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

/**
 * What a crawler may read.
 *
 * Everything behind a sign-in is disallowed — not as a security measure, since
 * those routes already require a session, but because a crawler that follows
 * them spends the site's crawl budget collecting redirects to the login page
 * instead of indexing products.
 *
 * Search results are excluded for a different reason: they are personal to the
 * searcher's location and change by the minute, so a crawler would file one
 * person's nearby stock as though it were the page's permanent content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/partner/',
          '/admin/',
          '/rider/',
          '/account',
          '/wallet',
          '/orders',
          '/cart',
          '/messages',
          '/notifications',
          '/favourites',
          '/rewards',
          '/onboarding',
          '/login',
          '/register',
          '/search',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
