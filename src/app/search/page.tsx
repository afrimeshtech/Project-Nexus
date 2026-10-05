import type { Metadata } from 'next'
import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { ProductResultCard } from '@/components/commerce/OfferCard'
import { Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui'
import { currentUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { TIER } from '@/lib/tiers'
import { listCategories } from '@/modules/catalog/service'
import { searchProducts } from '@/modules/search/service'

export const dynamic = 'force-dynamic'

interface SearchParams {
  q?: string
  category?: string
  radius?: string
  maxPrice?: string
  minRating?: string
  eta?: string
}

/**
 * Search results with the filters the PRD specifies: distance, price, rating,
 * availability and delivery speed. Filters are plain links rather than a
 * client-side form so the whole results page stays server-rendered, shareable
 * and fast on a mid-range Android phone over 3G.
 */
/**
 * The query belongs in the title: a results page for "rice" and one for
 * "cement" are different pages, and a shared link should say which.
 *
 * Results are personal to the searcher's location and change by the minute, so
 * the page asks not to be indexed — a crawler would file a snapshot of one
 * person's nearby stock as though it were the page's permanent content.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const params = await searchParams
  const q = params.q?.trim()
  const title = q ? `“${q}”` : 'Search nearby stock'

  return {
    title,
    description: q
      ? `Sellers near you with ${q} in stock right now, nearest first.`
      : 'Search real stock held by verified sellers near you on AfriMesh.',
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const [user, location, categories] = await Promise.all([
    currentUser(),
    buyerLocation(),
    listCategories(),
  ])

  const radius = Number(params.radius ?? 25)
  const ctx = {
    lat: location.lat,
    lng: location.lng,
    tier: TIER.consumer,
    userId: user?.id ?? null,
  }

  const { results, tookMs } = await searchProducts(ctx, params.q ?? '', {
    maxDistanceKm: radius,
    categoryId: params.category,
    maxPrice: params.maxPrice ? Number(params.maxPrice) * 100 : undefined,
    minRating: params.minRating ? Number(params.minRating) : undefined,
    maxEtaMinutes: params.eta ? Number(params.eta) : undefined,
  })

  const buildHref = (patch: Partial<SearchParams>) => {
    const next = new URLSearchParams()
    const merged = { ...params, ...patch }
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, String(value))
    }
    return `/search?${next.toString()}`
  }

  const activeCategory = categories.find((c) => c.id === params.category)

  return (
    <ConsumerShell>
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[
            { label: 'Home', href: '/' },
            ...(activeCategory
              ? [{ label: 'Categories', href: '/search' }, { label: activeCategory.name }]
              : [{ label: params.q ? `Search: ${params.q}` : 'Search' }]),
          ]}
          title={
            params.q
              ? `Results for “${params.q}”`
              : (activeCategory?.name ?? 'Everything in stock nearby')
          }
          subtitle={`${results.length} product${results.length === 1 ? '' : 's'} available within ${radius} km of ${location.label} · found in ${tookMs} ms`}
        />

        <Card className="space-y-3">
          <FilterRow label="Distance">
            {[5, 10, 25, 50].map((km) => (
              <FilterChip key={km} href={buildHref({ radius: String(km) })} active={radius === km}>
                {km} km
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="Arrives within">
            {[
              { label: '1 hour', value: '60' },
              { label: '3 hours', value: '180' },
              { label: 'Any', value: '' },
            ].map((opt) => (
              <FilterChip
                key={opt.label}
                href={buildHref({ eta: opt.value })}
                active={(params.eta ?? '') === opt.value}
              >
                {opt.label}
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="Rating">
            {[
              { label: 'Any', value: '' },
              { label: '3+ stars', value: '3' },
              { label: '4+ stars', value: '4' },
            ].map((opt) => (
              <FilterChip
                key={opt.label}
                href={buildHref({ minRating: opt.value })}
                active={(params.minRating ?? '') === opt.value}
              >
                {opt.label}
              </FilterChip>
            ))}
          </FilterRow>

          {categories.length > 0 && (
            <FilterRow label="Category">
              <FilterChip href={buildHref({ category: '' })} active={!params.category}>
                All
              </FilterChip>
              {categories.slice(0, 8).map((c) => (
                <FilterChip
                  key={c.id}
                  href={buildHref({ category: c.id })}
                  active={params.category === c.id}
                >
                  {c.name}
                </FilterChip>
              ))}
            </FilterRow>
          )}
        </Card>

        {results.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => (
              <ProductResultCard key={result.product_id} result={result} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title="Nothing available within range"
            body={
              params.q
                ? `No verified seller within ${radius} km of ${location.label} has “${params.q}” in stock right now. Widen the distance, or check back — sellers restock daily.`
                : 'Try widening the distance filter or choosing another area.'
            }
            action={
              <Link
                href={buildHref({ radius: '50' })}
                className="text-sm font-semibold text-accent-strong hover:underline"
              >
                Search within 50 km instead
              </Link>
            }
          />
        )}

        {results.length > 0 && (
          <section>
            {/* FUTURE-RANKING: the published weights return with ranking. */}
            <SectionHeading title="About these results" subtitle="Nearest shops first." />
            <p className="text-xs text-muted">
              Only stock that a verified seller has on the shelf right now is shown. Reserved units
              are excluded, so what you see is what you can actually buy.
            </p>
          </section>
        )}
      </div>
    </ConsumerShell>
  )
}

/**
 * A labelled set of filter options.
 *
 * The label is tied to the group rather than merely sitting beside it, so a
 * screen reader announces "Distance, group" before reading the options. Read
 * without that association, the four chips are just "5 km, 10 km, 25 km,
 * 50 km" arriving from nowhere.
 */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-2">
      <span id={id} className="w-24 shrink-0 font-technical text-eyebrow uppercase text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      // Which filter is applied was carried by colour alone, so it did not
      // exist for anyone using a screen reader — and colour alone is not a
      // state anyone should have to rely on. aria-current says it outright.
      aria-current={active ? 'true' : undefined}
      // py-1.5 rather than py-1: at the smaller padding the chip is a hair
      // under the 24px minimum a pointer target has to clear.
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-accent-500 text-accent-ink'
          : 'border border-line bg-surface text-muted hover:border-accent-500 hover:text-accent-strong'
      }`}
    >
      {children}
    </Link>
  )
}
