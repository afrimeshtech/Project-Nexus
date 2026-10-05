import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { ActivityPanel } from '@/components/territory/ActivityPanel'
import { Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import {
  territorySummary,
  AUDIENCE_LABEL,
  AUDIENCE_NOUN,
  type Audience,
} from '@/modules/territory/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Demand map' }

/**
 * The network's geography, tier by tier.
 *
 * Every other dashboard sees one slice of this — an outlet sees shoppers, a
 * merchant sees outlets. The console sees the whole chain at once, which is
 * what makes it possible to spot the mismatches that matter: shoppers
 * concentrated where no outlet has opened, outlets buying in a city with no
 * merchant, deliveries clustered where there are no riders.
 */
const TIERS: { audience: Audience; note: string }[] = [
  { audience: 'consumer', note: 'Retail demand — where outlets should be stocking and opening' },
  { audience: 'outlet', note: 'Wholesale demand — where merchants should be selling' },
  { audience: 'merchant', note: 'Distribution demand — where warehouses should be supplying' },
  { audience: 'rider', note: 'Completed deliveries — where the logistics load actually falls' },
]

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  await requireRole(ADMIN_ROLES, '/admin/locations')

  const requested = Number((await searchParams).days)
  const days = [30, 90, 180].includes(requested) ? requested : 90

  const summaries = await Promise.all(
    TIERS.map((tier) => territorySummary({ audience: tier.audience, days })),
  )

  return (
    <AdminShell active="/admin/locations">
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Locations' }]}
          title="Demand map"
          subtitle="Where each tier of the network is active. The platform's whole premise is that stock, buyers and delivery capacity should sit close together — this is where you see whether they do."
          actions={
            <div className="flex gap-1.5">
              {[30, 90, 180].map((option) => (
                <Link
                  key={option}
                  href={`/admin/locations?days=${option}`}
                  className={`rounded-full px-3.5 py-2 text-xs font-medium ${
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
          {TIERS.map((tier, index) => (
            <Stat
              key={tier.audience}
              label={AUDIENCE_LABEL[tier.audience]}
              value={summaries[index].actors}
              hint={`${summaries[index].areas} area${
                summaries[index].areas === 1 ? '' : 's'
              } · ${formatMoney(summaries[index].value)}`}
              icon={
                tier.audience === 'consumer'
                  ? 'user'
                  : tier.audience === 'outlet'
                    ? 'store'
                    : tier.audience === 'merchant'
                      ? 'box'
                      : 'scooter'
              }
            />
          ))}
        </div>

        <Card>
          <SectionHeading
            title="Reading this"
            subtitle="What the console can see that no single business can"
          />
          <ul className="space-y-3 text-sm">
            <li>
              <p className="font-medium text-ink">Coverage gaps</p>
              <p className="text-xs text-muted">
                An area busy with shoppers but thin on outlets is a recruitment target, not a
                success. Compare the first two maps below.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">Supply-chain misalignment</p>
              <p className="text-xs text-muted">
                Outlets buying heavily in a city with no active merchant means goods are travelling
                further than they need to — every one of those kilometres is cost the network is
                carrying.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">Logistics pressure</p>
              <p className="text-xs text-muted">
                Delivery density that does not track buyer density is where riders are being sent on
                long, unprofitable trips.
              </p>
            </li>
          </ul>
        </Card>

        {TIERS.map((tier) => (
          <ActivityPanel
            key={tier.audience}
            audience={tier.audience}
            title={`Where ${AUDIENCE_NOUN[tier.audience]} are most active`}
            subtitle={tier.note}
            origin={null}
            originLabel="Network centre"
            days={days}
            limit={10}
            // The console is the one place a single-actor cell is legitimate:
            // it is exactly the signal an operations lead needs to find a
            // market with one lonely participant in it.
            minActors={1}
          />
        ))}
      </div>
    </AdminShell>
  )
}
