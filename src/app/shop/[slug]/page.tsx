import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { OfferCard } from '@/components/commerce/OfferCard'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { Badge, Card, EmptyState, Rating, SectionHeading, Thumb } from '@/components/ui'
import { toggleFavouriteSellerAction } from '@/app/actions/cart'
import { requireUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { hydrateCart } from '@/lib/cart'
import { deliveryLaunched } from '@/lib/launch-fulfilment'
import { RATINGS_LAUNCHED } from '@/lib/launch-ratings'
import { TIER, ORG_LABEL, type OrgType } from '@/lib/tiers'
import { formatDistance, formatEta, haversineKm, estimateEtaMinutes } from '@/lib/geo'
import { getOrganisation, ratingsFor } from '@/modules/organisations/service'
import { offersFromSeller } from '@/modules/search/service'

export const dynamic = 'force-dynamic'

/** A seller's shopfront: everything they physically have, plus their record. */
/**
 * A shop page is a seller's front door — the link they share and the page a
 * search for their business name should reach. It was inheriting the generic
 * site description, which named neither the seller nor where they are.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const org = await getOrganisation(decodeURIComponent(slug))
  if (!org) return { title: 'Shop not found' }

  // Lagos city sits in Lagos state, and "Lagos, Lagos" reads as a mistake.
  const where = [...new Set([org.city, org.state].filter(Boolean))].join(', ')
  const title = where ? `${org.name} — ${where}` : org.name
  const description = `Buy from ${org.name}${where ? ` in ${where}` : ''} on AfriMesh. See what they have in stock right now, what it costs, and how quickly it can reach you.`

  return {
    title,
    description,
    alternates: { canonical: `/shop/${org.slug}` },
    openGraph: { title, description, type: 'website' },
  }
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await getOrganisation(decodeURIComponent(slug))
  if (!org) notFound()

  // Browsing shop cards on the storefront is open to guests; a specific
  // seller's live stock and prices is what asks for an account.
  const user = await requireUser(`/shop/${slug}`)
  const [location, reviews, cart] = await Promise.all([
    buyerLocation(),
    ratingsFor(org.id, 8),
    hydrateCart(),
  ])

  const ctx = {
    lat: location.lat,
    lng: location.lng,
    tier: TIER.consumer,
    userId: user.id,
  }
  // Only consumers buy from outlets. For any other tier the shopfront is
  // informational, which keeps the business rules honest on this page too.
  const offers =
    org.type === 'outlet' ? await offersFromSeller(ctx, org.id, { maxDistanceKm: 200 }) : []

  // For the overlay stepper's "already in the basket?" state — a plain
  // lookup rather than passing the whole cart down every card.
  const cartQtyByItem = new Map(cart.lines.map((line) => [line.inventory_item_id, line.qty]))

  const distance = haversineKm(location, { lat: org.lat, lng: org.lng })
  const eta = estimateEtaMinutes(distance, org.avg_dispatch_minutes)

  return (
    <ConsumerShell>
      <div className="space-y-8">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <SellerThumb name={org.name} logoUrl={org.logo_url} type={org.type} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{org.name}</h1>
              {org.verification === 'verified' ? (
                <Badge tone="brand">Verified</Badge>
              ) : (
                <Badge tone="warning">Pending verification</Badge>
              )}
              <Badge tone="neutral">{ORG_LABEL[org.type as OrgType]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {[org.address, org.city, org.state].filter(Boolean).join(', ')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <Rating value={org.rating} count={org.rating_count} />
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" size={13} />
                {formatDistance(distance)} away
              </span>
              {/* FUTURE-DELIVERY: a delivery time and radius mean nothing to a
                  shopper who collects. */}
              {deliveryLaunched() && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="scooter" size={13} />
                  about {formatEta(eta)}
                </span>
              )}
              <span>Fulfils {Number(org.fulfilment_rate).toFixed(0)}% of orders</span>
              {deliveryLaunched() ? (
                <span>Delivers within {Number(org.delivery_radius_km).toFixed(0)} km</span>
              ) : (
                <span>Order online, collect in store</span>
              )}
            </div>
          </div>

          <form action={toggleFavouriteSellerAction}>
            <input type="hidden" name="organisationId" value={org.id} />
            <button
              type="submit"
              className="rounded-brand border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
            >
              Save shop
            </button>
          </form>
        </Card>

        {org.type === 'outlet' ? (
          <section>
            <SectionHeading
              title="In stock now"
              subtitle={`${offers.length} products available at this outlet`}
            />
            {offers.length ? (
              <div className="space-y-3">
                {offers.map((offer) => (
                  <OfferCard
                    key={offer.inventory_item_id}
                    offer={offer}
                    showScore={false}
                    lead="product"
                    cartQty={cartQtyByItem.get(offer.inventory_item_id) ?? 0}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="box"
                title="Nothing listed right now"
                body="This seller has no stock available at the moment."
              />
            )}
          </section>
        ) : (
          <Card>
            <p className="text-sm text-muted">
              {org.name} is a {ORG_LABEL[org.type as OrgType].toLowerCase()} and supplies businesses
              rather than consumers. Under the AfriMesh supply-chain rules, outlets buy from
              merchants and merchants buy from dealer warehouses &mdash; consumers buy from outlets.
            </p>
          </Card>
        )}

        {/* FUTURE-RATINGS */}
        {RATINGS_LAUNCHED && reviews.length > 0 && (
          <section>
            <SectionHeading
              title="Ratings"
              subtitle="Only buyers with a completed order on this platform can leave a rating"
            />
            <div className="space-y-2">
              {reviews.map((review, index) => (
                <Card key={index} className="flex gap-3">
                  <Thumb alt={review.rater_name} size="sm" rounded="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{review.rater_name}</span>
                      <Rating value={review.stars} />
                    </div>
                    {review.comment && (
                      <p className="mt-0.5 text-sm text-muted">{review.comment}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </ConsumerShell>
  )
}
