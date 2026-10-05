import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { RejectBusinessForm } from '@/components/admin/AdminForms'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { Badge, Card, EmptyState, PageHeader, Rating } from '@/components/ui'
import { toggleSuspensionAction, verifyOrganisationAction } from '@/app/actions/admin'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { ORG_LABEL, type OrgType } from '@/lib/tiers'
import { listOrganisations } from '@/modules/organisations/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Businesses' }

const TYPES: (OrgType | 'all')[] = [
  'all',
  'outlet',
  'merchant',
  'warehouse',
  'manufacturer',
  'logistics',
]

/** Verification queue and business register (PRD Admin Module). */
export default async function AdminOrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; verification?: string; q?: string }>
}) {
  const params = await searchParams
  const admin = await requireRole(ADMIN_ROLES, '/admin/organisations')
  const readOnly = admin.role === 'auditor'

  const organisations = await listOrganisations({
    type: params.type && params.type !== 'all' ? (params.type as OrgType) : undefined,
    verification: params.verification,
    search: params.q,
  })

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v))
    return `/admin/organisations?${next.toString()}`
  }

  return (
    <AdminShell active="/admin/organisations">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Organisations' }]}
          title="Businesses"
          subtitle="Verification gates discoverability — an unverified business cannot be recommended to buyers."
        />

        <Card className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" action="/admin/organisations">
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="org-q">
                Search
              </label>
              <input
                id="org-q"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Business name"
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((type) => (
              <Link
                key={type}
                href={href({ type: type === 'all' ? '' : type })}
                className={`rounded-full px-3.5 py-2 text-xs font-medium ${
                  (params.type ?? 'all') === type
                    ? 'bg-accent-500 text-accent-ink'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                {type === 'all' ? 'All types' : ORG_LABEL[type as OrgType]}
              </Link>
            ))}
            <span className="mx-1 h-5 w-px bg-surface-strong" />
            {['', 'pending', 'verified', 'rejected'].map((v) => (
              <Link
                key={v || 'any'}
                href={href({ verification: v })}
                className={`rounded-full px-3.5 py-2 text-xs font-medium ${
                  (params.verification ?? '') === v
                    ? 'bg-surface-deep text-white'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                {v || 'Any status'}
              </Link>
            ))}
          </div>
        </Card>

        {organisations.length ? (
          <div className="space-y-2">
            {organisations.map((org) => (
              <Card key={org.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SellerThumb name={org.name} logoUrl={org.logo_url} type={org.type} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/shop/${org.slug}`}
                      className="font-semibold text-ink hover:text-accent-strong"
                    >
                      {org.name}
                    </Link>
                    <Badge tone="neutral">{ORG_LABEL[org.type as OrgType]}</Badge>
                    {org.verification === 'verified' ? (
                      <Badge tone="brand">Verified</Badge>
                    ) : org.verification === 'rejected' ? (
                      <Badge tone="danger">Rejected</Badge>
                    ) : (
                      <Badge tone="warning">Pending</Badge>
                    )}
                    {org.status === 'suspended' && <Badge tone="danger">Suspended</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[org.address, org.city, org.state].filter(Boolean).join(', ')}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>Owner: {org.owner_name ?? '—'}</span>
                    <span>RC: {org.registration_number ?? 'not provided'}</span>
                    <span>{org.sku_count} listings</span>
                    <Rating value={org.rating} count={org.rating_count} />
                    <span>Trust {Number(org.trust_score).toFixed(0)}</span>
                  </div>
                </div>

                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    {org.verification !== 'verified' && (
                      <form action={verifyOrganisationAction}>
                        <input type="hidden" name="organisationId" value={org.id} />
                        <ConfirmSubmitButton
                          message={`Verify ${org.name}? They become live and discoverable to buyers immediately.`}
                          className="rounded-brand bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-600"
                        >
                          Verify
                        </ConfirmSubmitButton>
                      </form>
                    )}
                    {org.verification !== 'rejected' && (
                      <RejectBusinessForm organisationId={org.id} />
                    )}
                    <form action={toggleSuspensionAction}>
                      <input type="hidden" name="organisationId" value={org.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={org.status === 'suspended' ? 'active' : 'suspended'}
                      />
                      {org.status === 'suspended' ? (
                        <button
                          type="submit"
                          className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
                        >
                          Reinstate
                        </button>
                      ) : (
                        <ConfirmSubmitButton
                          message={`Suspend ${org.name}? Their listings stop being discoverable to buyers immediately.`}
                          className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
                        >
                          Suspend
                        </ConfirmSubmitButton>
                      )}
                    </form>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="store" title="No businesses match those filters" />
        )}
      </div>
    </AdminShell>
  )
}
