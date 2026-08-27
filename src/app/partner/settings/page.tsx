import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { EditBusinessForm } from '@/components/partner/BusinessForm'
import { LogoUpload } from '@/components/media/ImageUpload'
import { Badge, Card, PageHeader, Rating, SectionHeading } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { ORG_LABEL, supplierTypeFor, type OrgType } from '@/lib/tiers'
import { getOrganisation, ratingsFor } from '@/modules/organisations/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Business settings' }

export default async function PartnerSettingsPage() {
  await requireUser('/partner/settings')
  const current = await currentOrganisation()
  if (!current) redirect('/onboarding')

  const [org, reviews] = await Promise.all([
    getOrganisation(current.id),
    ratingsFor(current.id, 10),
  ])
  if (!org) redirect('/onboarding')

  const supplier = supplierTypeFor(org.tier_level)
  const sellsTo =
    org.type === 'outlet'
      ? 'Consumers'
      : org.type === 'merchant'
        ? 'Retail outlets'
        : org.type === 'warehouse'
          ? 'Merchants'
          : 'Dealer warehouses'

  return (
    <PartnerShell active="/partner/settings">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Settings' }]}
          title="Business settings"
          subtitle="Your location and dispatch time directly affect where you rank with buyers."
        />

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <Card>
              <SectionHeading
                title="Your logo"
                subtitle="Shown to buyers on search results, your shop page and every order you fulfil."
              />
              <LogoUpload currentUrl={org.logo_url} />
            </Card>

            <Card>
              <EditBusinessForm org={org} />
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <SectionHeading title="Your position in the chain" />
              <dl className="space-y-2 text-sm">
                <Row label="Business type" value={ORG_LABEL[org.type as OrgType]} />
                <Row label="Supply tier" value={`Tier ${org.tier_level}`} />
                <Row label="You sell to" value={sellsTo} />
                <Row
                  label="You source from"
                  value={supplier ? ORG_LABEL[supplier] : 'Nobody — you are the origin'}
                />
                <Row label="Price type" value={org.type === 'outlet' ? 'Retail' : 'Wholesale'} />
              </dl>
            </Card>

            <Card>
              <SectionHeading title="Standing" />
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Verification</span>
                  {org.verification === 'verified' ? (
                    <Badge tone="brand">Verified</Badge>
                  ) : (
                    <Badge tone="warning">{org.verification}</Badge>
                  )}
                </div>
                <Row label="Trust score" value={`${Number(org.trust_score).toFixed(0)} / 100`} />
                <Row label="Fulfilment rate" value={`${Number(org.fulfilment_rate).toFixed(0)}%`} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Rating</span>
                  <Rating value={org.rating} count={org.rating_count} />
                </div>
                <Row label="CAC number" value={org.registration_number ?? 'Not provided'} />
              </div>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                Trust, rating and fulfilment reliability are inputs to the recommendation engine.
                Dispatching quickly and fulfilling what you list is what moves you up the rankings —
                there is no paid placement.
              </p>
            </Card>

            {reviews.length > 0 && (
              <Card>
                <SectionHeading title="Recent ratings" />
                <ul className="space-y-2.5">
                  {reviews.map((review, index) => (
                    <li key={index}>
                      <div className="flex items-center gap-2">
                        <Rating value={review.stars} />
                        <span className="text-xs text-muted">{review.rater_name}</span>
                      </div>
                      {review.comment && <p className="text-sm text-muted">{review.comment}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PartnerShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}
