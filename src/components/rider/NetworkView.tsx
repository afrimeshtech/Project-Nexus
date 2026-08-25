import Link from 'next/link'
import { MapLegend, NetworkMap } from '@/components/charts/NetworkMap'
import { Badge, Card, EmptyState, SectionHeading, Stat } from '@/components/ui'
import { formatDistance } from '@/lib/geo'
import { formatMoney } from '@/lib/money'
import { ORG_LABEL, type OrgType } from '@/lib/tiers'
import { networkMap, type MapPin } from '@/modules/territory/service'

/**
 * The delivery partner's view of the network: every verified business they
 * might collect from and every drop that currently needs riding to, plotted
 * around where they are standing.
 *
 * Shared by the rider dashboard's map page and by the storefront, which
 * renders this instead of the product catalogue when a delivery partner is
 * signed in — browsing categories tells a rider nothing about where to be.
 */

export const RIDER_MAP_RADII = [5, 10, 25, 50]

export function riderRadius(raw: string | undefined, fallback = 25): number {
  const requested = Number(raw)
  return RIDER_MAP_RADII.includes(requested) ? requested : fallback
}

export async function RiderNetworkView({
  userId,
  origin,
  locationLabel,
  radiusKm,
  basePath,
}: {
  userId: string
  origin: { lat: number; lng: number }
  locationLabel: string
  radiusKm: number
  /** Where the radius switcher links back to — this view has two homes. */
  basePath: string
}) {
  const { places, deliveries, counts } = await networkMap(origin, {
    radiusKm,
    riderUserId: userId,
  })

  const pins = [...places, ...deliveries]
  const openDrops = deliveries.filter((pin) => pin.kind === 'dropoff')
  const myDrops = deliveries.filter((pin) => pin.kind === 'active_dropoff')
  const earnings = openDrops.reduce((sum, pin) => sum + Number(pin.value ?? 0), 0)

  const radiusLink = (km: number) =>
    basePath.includes('?') ? `${basePath}&radius=${km}` : `${basePath}?radius=${km}`

  return (
    <div className="space-y-7">
      <SectionHeading
        title="Network map"
        subtitle={`Every verified business and open delivery point within ${radiusKm} km of ${locationLabel}. You are at the centre.`}
        action={
          <div className="flex gap-1.5">
            {RIDER_MAP_RADII.map((km) => (
              <Link
                key={km}
                href={radiusLink(km)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  radiusKm === km
                    ? 'bg-accent-500 text-accent-ink'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                {km} km
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Places in range" value={places.length} icon="store" />
        <Stat
          label="Open delivery points"
          value={openDrops.length}
          hint={earnings > 0 ? `${formatMoney(earnings)} on the board` : 'Nothing waiting'}
          icon="pin"
          tone={openDrops.length ? 'brand' : 'neutral'}
        />
        <Stat label="Your active drops" value={myDrops.length} icon="scooter" />
        <Stat
          label="Nearest place"
          value={pins.length ? formatDistance(Number(pins[0].distance_km)) : '—'}
          hint={pins[0]?.label}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card>
          {pins.length ? (
            <>
              <NetworkMap
                pins={pins}
                origin={origin}
                radiusKm={radiusKm}
                caption={`Map of businesses and delivery points within ${radiusKm} km, you at the centre`}
              />
              <div className="mt-3 border-t border-line-soft pt-3">
                <MapLegend counts={counts} />
              </div>
            </>
          ) : (
            <EmptyState
              icon="pin"
              title="Nothing within range"
              body="Widen the radius, or move — the map is drawn around wherever you are."
            />
          )}
        </Card>

        <div className="space-y-4">
          {myDrops.length > 0 && (
            <Card>
              <SectionHeading
                title="Your active drops"
                subtitle="Finish these before taking new work"
              />
              <PinList pins={myDrops} tone="success" />
            </Card>
          )}

          <Card>
            <SectionHeading
              title="Delivery points waiting"
              subtitle="Unclaimed drops, nearest first"
              action={
                <Link
                  href="/rider"
                  className="text-sm font-medium text-accent-strong hover:underline"
                >
                  Accept jobs
                </Link>
              }
            />
            {openDrops.length ? (
              <PinList pins={openDrops} tone="danger" />
            ) : (
              <p className="text-sm text-muted">
                No unclaimed drops in range. Sellers raise a job the moment they dispatch.
              </p>
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Places you can collect from"
              subtitle="Verified outlets, merchants and warehouses, nearest first"
            />
            {places.length ? (
              <ul className="space-y-1.5">
                {places.slice(0, 14).map((pin) => (
                  <li
                    key={pin.id}
                    className="flex items-center justify-between gap-3 border-b border-line-soft pb-1.5 text-sm last:border-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{pin.label}</span>
                      <span className="block truncate text-xs text-muted">
                        {ORG_LABEL[pin.kind as OrgType] ?? pin.kind}
                        {pin.detail ? ` · ${pin.detail}` : ''}
                      </span>
                    </span>
                    <Badge tone="neutral">{formatDistance(Number(pin.distance_km))}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No verified businesses within {radiusKm} km.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function PinList({ pins, tone }: { pins: MapPin[]; tone: 'success' | 'danger' }) {
  return (
    <ul className="space-y-1.5">
      {pins.slice(0, 10).map((pin) => (
        <li
          key={pin.id}
          className="flex items-center justify-between gap-3 border-b border-line-soft pb-1.5 text-sm last:border-0 last:pb-0"
        >
          <span className="min-w-0">
            <span className="block truncate font-technical text-xs text-muted">{pin.label}</span>
            <span className="block truncate text-ink">{pin.detail ?? 'Address on acceptance'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge tone={tone}>{formatDistance(Number(pin.distance_km))}</Badge>
            {pin.value ? (
              <span className="font-semibold text-accent-strong">
                {formatMoney(Number(pin.value))}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
