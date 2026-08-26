import Link from 'next/link'
import { HotspotMap } from '@/components/charts/HotspotMap'
import { Badge, Card, EmptyState, SectionHeading } from '@/components/ui'
import { formatDistance } from '@/lib/geo'
import { formatMoney, formatMoneyCompact } from '@/lib/money'
import {
  activeLocations,
  territorySummary,
  MIN_ACTORS_PER_CELL,
  AUDIENCE_LABEL,
  AUDIENCE_NOUN,
  type ActivityQuery,
  type Audience,
} from '@/modules/territory/service'

/**
 * "Where are my buyers?", answered the same way on every dashboard.
 *
 * The audience changes with who is looking - an outlet watches shoppers, a
 * merchant watches outlets, the console watches everyone - but the question,
 * the ranking and the privacy floor do not, so there is one component.
 */
export async function ActivityPanel({
  audience,
  title,
  subtitle,
  origin,
  originLabel,
  radiusKm,
  ownOrgId,
  days = 90,
  limit = 8,
  minActors,
  moreHref,
  compact = false,
}: {
  audience: Audience
  title?: string
  subtitle?: string
  origin?: { lat: number; lng: number } | null
  originLabel?: string
  radiusKm?: number | null
  ownOrgId?: string | null
  days?: number
  limit?: number
  minActors?: number
  /** Link to the full breakdown, when this is a summary on another page. */
  moreHref?: string
  /** Ranked list only, for a dashboard tile rather than a full page. */
  compact?: boolean
}) {
  const query: ActivityQuery = {
    audience,
    origin,
    radiusKm,
    ownOrgId,
    days,
    limit,
    minActors,
  }
  const cells = await activeLocations(query)

  const noun = AUDIENCE_NOUN[audience]
  const heading = title ?? `Where ${noun} are most active`
  const busiest = cells[0]

  if (!cells.length) {
    // An empty list has two very different causes, and saying "nobody is
    // active here" when the truth is "too few to show safely" would flatly
    // contradict the totals above it. Only asked on the empty path.
    const anyActivity = await territorySummary({ ...query, ownOrgId: null })

    return (
      <Card>
        <SectionHeading title={heading} subtitle={subtitle} />
        {anyActivity.orders > 0 ? (
          <EmptyState
            icon="lock"
            title="Too few buyers here to show a breakdown"
            body={`${anyActivity.actors} ${
              anyActivity.actors === 1 ? noun.replace(/s$/, '') : noun
            } placed ${anyActivity.orders} order${
              anyActivity.orders === 1 ? '' : 's'
            } in range, but they are spread too thinly across ${anyActivity.areas} area${
              anyActivity.areas === 1 ? '' : 's'
            } to name any of them without identifying an individual. As trade in your area grows, the breakdown appears here.`}
          />
        ) : (
          <EmptyState
            icon="pin"
            title={`No ${noun} active here yet`}
            body={`Once ${noun} start ordering within range, the neighbourhoods they buy from appear here — so you can stock for where the demand actually is.`}
          />
        )}
      </Card>
    )
  }

  return (
    <Card>
      <SectionHeading
        title={heading}
        subtitle={
          subtitle ??
          `${AUDIENCE_LABEL[audience]} · paid orders over the last ${days} days${
            radiusKm ? `, within ${radiusKm} km` : ''
          }`
        }
        action={
          <span className="flex shrink-0 items-center gap-2">
            {busiest && (
              <Badge tone="brand">
                Busiest: {busiest.label.split(' of ').at(-1) ?? busiest.label}
              </Badge>
            )}
            {moreHref && (
              <Link
                href={moreHref}
                className="whitespace-nowrap text-sm font-medium text-accent-strong hover:underline"
              >
                All areas
              </Link>
            )}
          </span>
        }
      />

      <div className={compact ? '' : 'grid gap-5 lg:grid-cols-[18rem_1fr]'}>
        {!compact && (
          <HotspotMap
            cells={cells}
            origin={origin ?? null}
            originLabel={originLabel ?? 'You'}
            unit={noun}
            caption={`Map of where ${noun} are active, ${originLabel ?? 'your location'} at the centre`}
          />
        )}

        <div className="scroll-x">
          <table className="w-full min-w-[26rem] text-sm">
            <caption className="sr-only">{AUDIENCE_LABEL[audience]} by area, busiest first</caption>
            <thead>
              <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Area</th>
                <th className="py-2 pr-3 text-right font-medium">Active</th>
                <th className="py-2 pr-3 text-right font-medium">Orders</th>
                <th className="py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((cell, index) => (
                <tr key={index} className="border-b border-line-soft last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="block text-ink">{cell.label}</span>
                    <span className="block font-technical text-xs text-muted">
                      {cell.distance_km !== null && `${formatDistance(cell.distance_km)} away`}
                      {cell.distance_km !== null && cell.own_orders > 0 && ' · '}
                      {cell.own_orders > 0 && `you served ${cell.own_orders}`}
                    </span>
                    {/* The heat bar makes the ranking readable at a glance,
                        which a column of numbers does not. */}
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="block h-full rounded-full bg-accent-500"
                        style={{ width: `${Math.max(4, cell.intensity * 100)}%` }}
                      />
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold text-ink">
                    {cell.actors}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right text-muted">
                    {cell.orders}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-muted">
                    {compact
                      ? formatMoneyCompact(Number(cell.value))
                      : formatMoney(Number(cell.value))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
        {/* The console deliberately runs without the floor, so it must not
            claim one. A promise about privacy that is not being kept is worse
            than no promise at all. */}
        {(minActors ?? MIN_ACTORS_PER_CELL) > 1
          ? `Areas are grouped into neighbourhood-sized cells, and a cell is only shown once at least ${minActors ?? MIN_ACTORS_PER_CELL} different ${noun} are active in it — so this never identifies an individual.`
          : `Areas are grouped into neighbourhood-sized cells. The privacy floor is currently set to 1, so an area with a single active ${noun.replace(/s$/, '')} is named here — useful for spotting a market to grow, but raise TERRITORY_MIN_ACTORS before a dense launch.`}
      </p>
    </Card>
  )
}
