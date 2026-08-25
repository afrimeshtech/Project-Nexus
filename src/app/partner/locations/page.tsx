import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { ActivityPanel } from '@/components/territory/ActivityPanel'
import { Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import {
  audienceForSeller,
  territorySummary,
  AUDIENCE_NOUN,
  AUDIENCE_LABEL,
} from '@/modules/territory/service'
import { unmetDemand } from '@/modules/analytics/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Buyer locations' }

/** How far out a business looks for demand, by tier. */
function reachKmFor(radiusKm: number): number {
  // Its own delivery radius is the floor, but the useful view extends past it:
  // demand just outside your range is exactly what tells you where to grow.
  return Math.max(Math.round(radiusKm * 2.5), 10)
}

/**
 * Demand geography.
 *
 * The point of a proximity network is that stock should sit where the buying
 * is, and until you can see where the buying is you are stocking on instinct.
 * Each tier reads the tier it sells to.
 */
export default async function PartnerLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  await requireUser('/partner/locations')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const audience = audienceForSeller(org.type)
  if (!audience) redirect('/partner')

  const requested = Number((await searchParams).days)
  const days = [30, 90, 180].includes(requested) ? requested : 90

  const origin = { lat: org.lat, lng: org.lng }
  const radiusKm = reachKmFor(Number(org.delivery_radius_km))

  const [summary, demand] = await Promise.all([
    territorySummary({ audience, origin, radiusKm, days, ownOrgId: org.id }),
    unmetDemand(org.id, 6),
  ])

  const noun = AUDIENCE_NOUN[audience]
  const share = summary.orders ? Math.round((summary.own_orders / summary.orders) * 100) : 0

  return (
    <PartnerShell active="/partner/locations">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Buyer locations' }]}
          title="Buyer locations"
          subtitle={`Where the ${noun} you sell to are actually buying, within ${radiusKm} km of ${org.name}. Stock for the areas that are moving, not the ones that used to.`}
          actions={
            <div className="flex gap-1.5">
              {[30, 90, 180].map((option) => (
                <Link
                  key={option}
                  href={`/partner/locations?days=${option}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    days === option
                      ? 'bg-accent-500 text-accent-ink'
                      : 'border border-line bg-surface text-muted'
                  }`}
                >
                  {option} days
                </Link>
              ))}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label={`Active ${noun}`}
            value={summary.actors}
            hint={`Across ${summary.areas} area${summary.areas === 1 ? '' : 's'}`}
            icon={audience === 'consumer' ? 'user' : 'store'}
          />
          <Stat
            label="Orders in range"
            value={summary.orders}
            hint={`Last ${days} days`}
            icon="receipt"
          />
          <Stat
            label="Value in range"
            value={formatMoney(summary.value)}
            hint="What this territory spent"
          />
          <Stat
            label="Your share"
            value={`${share}%`}
            hint={`${summary.own_orders} of ${summary.orders} orders`}
            tone={share < 20 ? 'danger' : 'brand'}
          />
        </div>

        <ActivityPanel
          audience={audience}
          origin={origin}
          originLabel={org.name}
          radiusKm={radiusKm}
          ownOrgId={org.id}
          days={days}
          limit={10}
          subtitle={`${AUDIENCE_LABEL[audience]} · paid orders in the last ${days} days, within ${radiusKm} km`}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeading
              title="What to do with this"
              subtitle="The whole point of a proximity network"
            />
            <ul className="space-y-3 text-sm">
              <Advice
                title="Stock for the busiest areas"
                body={`The neighbourhoods at the top of the list are where ${noun} near you are spending. Weight your reorder levels towards what they buy.`}
              />
              <Advice
                title="Watch the areas you are not serving"
                body="A busy area where you served few orders is not a lost cause — it is the cheapest growth available, because the demand is already proven."
              />
              <Advice
                title="Set your delivery radius honestly"
                body={`You currently serve ${Number(org.delivery_radius_km).toFixed(0)} km. If the activity clusters beyond that, extending it is worth more than any discount.`}
              />
            </ul>
          </Card>

          <Card>
            <SectionHeading
              title="Unmet demand nearby"
              subtitle="Searches around you that returned nothing in stock — anywhere on the network"
            />
            {demand.length ? (
              <ul className="space-y-1.5">
                {demand.map((row) => (
                  <li key={row.query} className="flex items-center justify-between gap-3 text-sm">
                    <span className="capitalize text-ink">{row.query}</span>
                    <span className="shrink-0 text-muted">{row.hits} searches</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Every nearby search is currently being met by stock in the network.
              </p>
            )}
          </Card>
        </div>
      </div>
    </PartnerShell>
  )
}

function Advice({ title, body }: { title: string; body: string }) {
  return (
    <li>
      <p className="font-medium text-ink">{title}</p>
      <p className="text-xs text-muted">{body}</p>
    </li>
  )
}
