import { redirect } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { RegisterBusinessForm } from '@/components/partner/BusinessForm'
import { Card, SectionHeading } from '@/components/ui'
import { currentUser, currentOrganisation } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Register your business' }

export default async function OnboardingPage() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/onboarding')

  const existing = await currentOrganisation()
  if (existing) redirect('/partner')

  return (
    <ConsumerShell search={false}>
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <SectionHeading
            title="Register your business"
            // FUTURE-DASHBOARD: restore the full list as each tier is opened —
            // "Join the network as a retail outlet, merchant, dealer warehouse,
            //  manufacturer or delivery partner."
            subtitle="Join the network as a retail outlet selling to consumers near you."
          />
          <RegisterBusinessForm />
        </Card>

        <aside className="space-y-4">
          <Card>
            <h2 className="font-semibold text-ink">How the supply chain works</h2>
            {/* FUTURE-DASHBOARD: the chain is Manufacturer → Dealer warehouse →
                Merchant → Retail outlet → Consumer, and the ordering rules for
                all of it are already enforced in lib/tiers.ts. Only the last
                link is open for registration at launch, so listing the three
                tiers above it here would advertise accounts nobody can create.

                  { tier: 'Manufacturer', supplies: 'Dealer warehouses' },
                  { tier: 'Dealer warehouse', supplies: 'Merchants' },
                  { tier: 'Merchant', supplies: 'Retail outlets' },
            */}
            <ol className="mt-3 space-y-3 text-sm">
              {[{ tier: 'Retail outlet', supplies: 'Consumers' }].map((row, index) => (
                <li key={row.tier} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-500">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-medium text-ink">{row.tier}</span>
                    <span className="block text-xs text-muted">supplies {row.supplies}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
              You can only trade with the tier directly next to yours. That rule is enforced in the
              application, in the order service and as a database constraint. More tiers open as the
              network grows.
            </p>
          </Card>

          <Card>
            <h2 className="font-semibold text-ink">What you get</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              <li>· Discovery by buyers close to you</li>
              <li>· Live inventory with reservations, so you never oversell</li>
              <li>· A wallet with escrow settlement on delivery</li>
              {/* FUTURE-DASHBOARD: needs the merchant tier to restock from. */}
              {/* <li>· One-tap restocking from the tier above you</li> */}
              <li>· Sales, stock and demand analytics</li>
            </ul>
          </Card>
        </aside>
      </div>
    </ConsumerShell>
  )
}
