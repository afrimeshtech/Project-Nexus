import type { Metadata } from 'next'
import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { OutletCard } from '@/components/commerce/OutletCard'
import { Button, Card, EmptyState, PageHeader, SegmentedLinks } from '@/components/ui'
import { currentUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { TIER } from '@/lib/tiers'
import { rankSellers } from '@/modules/recommendation/service'

export const dynamic = 'force-dynamic'

interface ShopsSearchParams {
  q?: string
  radius?: string
}

/**
 * The directory the homepage's "Nearby outlets" card was missing an exit
 * into: a shopper past the first 8 nearest shops previously had nowhere to
 * go. Same discovery engine as `/search`, run over sellers instead of
 * products, with the same link-driven filters so the page stays
 * server-rendered and fast on a dropped connection.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ShopsSearchParams>
}): Promise<Metadata> {
  const params = await searchParams
  const q = params.q?.trim()
  return {
    title: q ? `Shops matching "${q}"` : 'Nearby outlets',
    description: q
      ? `Verified sellers near you named "${q}".`
      : 'Every verified shop within range of you on AfriMesh, ranked by distance.',
    // Personal to the viewer's location, same reasoning as /search.
    robots: { index: false, follow: true },
  }
}

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<ShopsSearchParams>
}) {
  const params = await searchParams
  const [user, location] = await Promise.all([currentUser(), buyerLocation()])

  const radius = Number(params.radius ?? 25)
  const ctx = {
    lat: location.lat,
    lng: location.lng,
    tier: TIER.consumer,
    userId: user?.id ?? null,
  }

  const outlets = await rankSellers(ctx, {
    maxDistanceKm: radius,
    search: params.q?.trim() || undefined,
    limit: 60,
  })

  const buildHref = (patch: Partial<ShopsSearchParams>) => {
    const next = new URLSearchParams()
    const merged = { ...params, ...patch }
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, String(value))
    }
    return `/shops?${next.toString()}`
  }

  return (
    <ConsumerShell>
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Nearby outlets' }]}
          title={params.q ? `Outlets matching “${params.q}”` : 'Nearby outlets'}
          subtitle={`${outlets.length} verified shop${outlets.length === 1 ? '' : 's'} within ${radius} km of ${location.label}`}
        />

        <Card className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" action="/shops">
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="shop-q">
                Shop name
              </label>
              <input
                id="shop-q"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="e.g. Grace Stores"
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            <input type="hidden" name="radius" value={radius} />
            <Button type="submit" className="shrink-0">
              Search
            </Button>
          </form>

          <SegmentedLinks
            label="Distance"
            active={String(radius)}
            options={[5, 10, 25, 50].map((km) => ({ value: String(km), label: `${km} km` }))}
            hrefFor={(value) => buildHref({ radius: value })}
          />
        </Card>

        {outlets.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outlets.map((outlet) => (
              <OutletCard key={outlet.id} outlet={outlet} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="store"
            title="No verified shop within range"
            body={
              params.q
                ? `No verified seller named “${params.q}” is within ${radius} km of ${location.label}.`
                : `No verified seller is within ${radius} km of ${location.label} yet.`
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
      </div>
    </ConsumerShell>
  )
}
