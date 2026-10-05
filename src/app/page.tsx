import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { CategoryRow } from '@/components/commerce/CategoryRow'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { ProductResultCard } from '@/components/commerce/OfferCard'
import { OutletCard } from '@/components/commerce/OutletCard'
import { AreaSwitch } from '@/components/commerce/AreaSwitch'
// FUTURE-DASHBOARD: import { RiderNetworkView, riderRadius } from '@/components/rider/NetworkView'
import { EmptyState, LinkButton, SectionHeading } from '@/components/ui'
import { currentUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { KNOWN_AREAS } from '@/lib/areas'
import { TIER } from '@/lib/tiers'
import { listCategories } from '@/modules/catalog/service'
import { popularNearby, recentSearches, trendingSearches } from '@/modules/search/service'
import { rankSellers } from '@/modules/recommendation/service'

export const dynamic = 'force-dynamic'

/**
 * Consumer home.
 *
 * Everything on this page is derived from what is actually in stock within
 * range of the viewer right now. There is no editorial merchandising, because
 * the product promise is "accurate product discovery" - a category tile or a
 * popular item that turns out to be unavailable is the exact failure the BRS
 * describes.
 */
// FUTURE-DASHBOARD: `searchParams` existed only for the delivery partner branch
// below — `?radius=` sized the map and `?shop=1` escaped back to the storefront.
// Restore the parameter and the `params` binding along with that branch:
//
//   export default async function HomePage({
//     searchParams,
//   }: {
//     searchParams: Promise<{ radius?: string; shop?: string }>
//   }) {
//     const [user, location, params] = await Promise.all([
//       currentUser(),
//       buyerLocation(),
//       searchParams,
//     ])
export default async function HomePage() {
  const [user, location] = await Promise.all([currentUser(), buyerLocation()])

  /*
   * FUTURE-DASHBOARD: the delivery partner's storefront.
   *
   * For a delivery partner the storefront *is* the map — a rider never buys
   * stock, so a wall of product categories tells them nothing they can act on,
   * and `?shop=1` opened the ordinary storefront for when they do want to buy
   * something. With the tier switched off nobody holds the role, so this branch
   * would never be taken; it is kept whole so restoring it is one uncomment.
   *
   * RiderNetworkView, riderRadius and the /rider routes are all still live.
   *
   * if (user?.role === 'delivery_partner' && !params.shop) {
   *   return (
   *     <ConsumerShell search={false}>
   *       <div className="space-y-6">
   *         <RiderNetworkView
   *           userId={user.id}
   *           origin={{ lat: location.lat, lng: location.lng }}
   *           locationLabel={location.label}
   *           radiusKm={riderRadius(params.radius)}
   *           basePath="/"
   *         />
   *         <Card className="flex flex-wrap items-center justify-between gap-3">
   *           <div>
   *             <p className="font-medium text-ink">Looking to buy something yourself?</p>
   *             <p className="text-xs text-muted">
   *               The ordinary storefront is still here — this page just leads with the map,
   *               because that is what a delivery partner needs first.
   *             </p>
   *           </div>
   *           <LinkButton href="/?shop=1" variant="secondary">
   *             Browse the shop
   *           </LinkButton>
   *         </Card>
   *       </div>
   *     </ConsumerShell>
   *   )
   * }
   */

  const ctx = {
    lat: location.lat,
    lng: location.lng,
    tier: TIER.consumer,
    userId: user?.id ?? null,
  }

  const [categories, popular, outlets, trending] = await Promise.all([
    listCategories(),
    popularNearby(ctx, 8),
    rankSellers(ctx, { limit: 8 }),
    // A signed-in shopper's own history is a more useful shortcut back into
    // the catalogue than area-wide trending once there is a real history to
    // draw on; a guest still gets the trending list. `hits` stays undefined
    // for personal history because a recency-ordered list has no honest count
    // to show — see the conditional render below.
    user
      ? recentSearches(user.id, 6).then((rows) =>
          rows.map((r) => ({ query: r.query, hits: undefined as number | undefined })),
        )
      : trendingSearches(6),
  ])

  const greeting = user ? `Hello, ${user.full_name.split(' ')[0]}` : 'Find what you need, nearby'
  const searchRailLabel = user ? 'Your recent searches' : 'Searched nearby'

  return (
    <ConsumerShell>
      <div className="space-y-8">
        {/* An asymmetric masthead rather than a centred stack.
            The greeting and the promise hold a narrow measure on the left;
            what people near you are actually searching for sits in its own
            rail on the right. Two unequal columns give the page a top edge
            with structure — a full-width heading over a full-width paragraph
            over a row of chips is the shape every generated homepage has. */}
        <section className="grid gap-x-10 gap-y-6 border-b border-line-soft pb-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div>
            {/* Was an eyebrow above the h1 — DESIGN.md bans that structure
                ("the Eyebrow role exists for labels inside components... a
                heading carries its own weight"). Location is real
                information the header hides below sm, not a caption for the
                greeting, so it now follows the heading as a plain supporting
                line rather than introducing it. */}
            <h1 className="text-display-sm text-ink">{greeting}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Icon name="pin" size={12} />
              {location.label}
            </p>
            <p className="mt-3 max-w-[46ch] text-base text-muted">
              Search once to see what&rsquo;s really in stock nearby, pay safely, and collect it
              from the shop. Sellers restock as they sell, so everything below is what a verified
              seller near you actually has right now.
            </p>
          </div>

          {trending.length > 0 && (
            <aside className="lg:border-l lg:border-line-soft lg:pl-6">
              <p className="font-technical text-eyebrow uppercase text-muted">{searchRailLabel}</p>
              <ul className="mt-2.5 space-y-1">
                {trending.map((t) => (
                  <li key={t.query}>
                    <Link
                      href={`/search?q=${encodeURIComponent(t.query)}`}
                      className="group flex items-baseline justify-between gap-3 py-0.5 text-sm text-muted hover:text-accent-strong"
                    >
                      <span className="truncate capitalize group-hover:underline">{t.query}</span>
                      {t.hits !== undefined && (
                        <span className="shrink-0 font-technical text-xs tabular-nums opacity-60">
                          {t.hits}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </section>

        {categories.length > 0 && (
          <section>
            <SectionHeading title="Top categories" />
            {/* Five, then an overflow — the reference design deliberately does
                not present a wall of categories on first open. */}
            <CategoryRow categories={categories} limit={5} />
          </section>
        )}

        <section>
          <SectionHeading
            title="Popular nearby"
            subtitle="In stock right now, nearest first"
            action={
              <Link
                href="/search"
                className="text-sm font-medium text-accent-strong hover:underline"
              >
                See all
              </Link>
            }
          />
          {popular.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map((result) => (
                <ProductResultCard key={result.product_id} result={result} />
              ))}
            </div>
          ) : (
            /* The action here used to be "Register a business", which answers a
               question a shopper did not ask: they came to buy, were told the
               problem is their area, and were then offered a trader's task as
               the only way forward. Changing area is the fix for what actually
               went wrong, so that is the primary action now; registering is
               kept, demoted to the aside it always was. */
            <EmptyState
              icon="pin"
              title="Nothing in stock around here yet"
              body={`No verified seller has listed stock within range of ${location.label} yet. Try one of these areas instead.`}
              action={
                <div className="space-y-3">
                  <AreaSwitch areas={KNOWN_AREAS} current={location.label} />
                  <p className="text-xs text-muted">
                    Trade around here yourself?{' '}
                    <Link href="/onboarding" className="font-medium text-accent-strong underline">
                      Register your business
                    </Link>{' '}
                    and be the first.
                  </p>
                </div>
              }
            />
          )}
        </section>

        {outlets.length > 0 && (
          <section>
            <SectionHeading
              title="Nearby outlets"
              subtitle="Verified shops closest to you"
              action={
                <Link
                  href="/shops"
                  className="text-sm font-medium text-accent-strong hover:underline"
                >
                  See all
                </Link>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {outlets.map((outlet) => (
                <OutletCard key={outlet.id} outlet={outlet} />
              ))}
            </div>
          </section>
        )}

        <section className="mesh-surface hero hero-compact">
          <h2 className="text-display-sm">
            Sell on <span className="accent-word">AfriMesh</span>
          </h2>
          <p className="hero-lede">
            Neighbourhood shops: list what you have and get discovered by buyers close to you.
          </p>
          <div className="hero-actions">
            <LinkButton href="/onboarding" variant="secondary">
              Register your business
            </LinkButton>
            <Link
              href="/about"
              className="inline-flex items-center rounded-brand px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              How the network works
            </Link>
          </div>
        </section>
      </div>
    </ConsumerShell>
  )
}
