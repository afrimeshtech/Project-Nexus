import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Card, SectionHeading } from '@/components/ui'
import { getWeights } from '@/modules/recommendation/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'How the network works' }

/**
 * Explains the ranking model in plain language. Publishing the weights is a
 * deliberate expression of the brand's "Transparent" and "Trustworthy"
 * personality: sellers can see exactly what improves their position, and
 * buyers can see that ordering is not paid placement.
 */
export default async function AboutPage() {
  const weights = await getWeights('consumer')
  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  const EXPLAIN: Record<string, string> = {
    availability: 'Is it genuinely on the shelf, and is there enough depth of stock?',
    distance: 'How far you would have to travel, or the goods would have to move.',
    price: 'How the price compares with the cheapest offer nearby.',
    rating: 'Verified ratings only, damped while a seller has few reviews.',
    delivery_time: 'The seller’s dispatch time plus realistic travel time.',
    trust: 'Platform trust score, earned through verification and clean trading history.',
    purchase_history: 'Sellers you have already bought from successfully.',
  }

  return (
    <ConsumerShell search={false}>
      <div className="space-y-8">
        <section className="mesh-surface hero">
          <h1 className="text-display max-w-3xl">
            Commerce should begin <span className="accent-word">locally</span>.
          </h1>
          <p className="hero-lede">
            Every unnecessary kilometre adds cost. Every unavailable product wastes time. Every
            disconnected retailer loses revenue. AfriMesh makes nearby inventory visible, trusted
            and instantly transactable.
          </p>
        </section>

        <section>
          <SectionHeading
            title="How results are ranked"
            subtitle="No paid placement. Every result is scored by the same public formula."
          />
          <Card>
            <ul className="space-y-3">
              {Object.entries(weights)
                .sort((a, b) => b[1] - a[1])
                .map(([factor, weight]) => (
                  <li key={factor}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium capitalize text-ink">
                        {factor.replace(/_/g, ' ')}
                      </span>
                      <span className="font-technical text-sm text-muted">
                        {Math.round((weight / total) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-accent-500"
                        style={{ width: `${(weight / total) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted">{EXPLAIN[factor]}</p>
                  </li>
                ))}
            </ul>
          </Card>
        </section>

        <section>
          <SectionHeading title="The rules of the network" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: 'Only real stock is shown',
                body: 'Listings reflect live inventory that a verified seller physically holds. Units reserved for someone else are invisible, so what you see is what you can buy.',
              },
              {
                // FUTURE-DASHBOARD: the full chain, for when the upper tiers open —
                // 'Consumers buy from retail outlets. Outlets buy from merchants.
                //  Merchants buy from dealer warehouses. Warehouses supply merchants only.'
                title: 'One tier at a time',
                body: 'Consumers buy from retail outlets, and only from retail outlets. The wholesale tiers above them open as the network grows.',
              },
              {
                title: 'Money is held in escrow',
                body: 'Your payment sits in escrow until the order is delivered. Nothing reaches the seller’s spendable balance before that.',
              },
              {
                title: 'Ratings require a real purchase',
                body: 'Only a buyer with a completed order on this platform can rate a seller, once, for that order.',
              },
            ].map((rule) => (
              <Card key={rule.title}>
                <h3 className="font-semibold text-ink">{rule.title}</h3>
                <p className="mt-1 text-sm text-muted">{rule.body}</p>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </ConsumerShell>
  )
}
