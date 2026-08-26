import Link from 'next/link'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { Badge, Card, Rating } from '@/components/ui'
import { formatDistance, formatEta } from '@/lib/geo'
import type { rankSellers } from '@/modules/recommendation/service'

type Outlet = Awaited<ReturnType<typeof rankSellers>>[number]

/**
 * A verified nearby outlet, linking to its shopfront.
 *
 * `rankSellers` only ever returns rows with `verification = 'verified'`, so
 * the badge here states a fact the row could not exist without — it is never
 * a guess. Shared by the homepage and `/shops` so the two lists are the same
 * card, not two components that drift apart.
 */
export function OutletCard({ outlet }: { outlet: Outlet }) {
  return (
    <Link href={`/shop/${outlet.slug}`} className="block h-full min-w-0">
      <Card className="flex h-full items-center gap-3 card-interactive hover:card-interactive-hover">
        <SellerThumb name={outlet.name} logoUrl={outlet.logo_url} type={outlet.type} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate font-semibold text-ink">{outlet.name}</p>
            <Badge tone="brand" className="shrink-0">
              Verified
            </Badge>
          </div>
          <p className="truncate text-xs text-muted">{outlet.address ?? outlet.city}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{formatDistance(outlet.distance_km)}</span>
            <span>· {formatEta(outlet.eta_minutes)}</span>
            <Rating value={outlet.rating} count={outlet.rating_count} />
          </div>
          <Badge tone="neutral" className="mt-1.5">
            {outlet.sku_count} products in stock
          </Badge>
        </div>
      </Card>
    </Link>
  )
}
