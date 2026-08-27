import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { IssueKeyForm, RevokeKeyButton } from '@/components/partner/ApiKeyForms'
import { Badge, Card, EmptyState, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { listKeys, keyUsage, API_SCOPES, SCOPE_LABEL } from '@/modules/api/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'API access' }

/**
 * API access for a business.
 *
 * "AfriMesh will be API-first ... Future enterprise APIs will enable
 * integration with banks, manufacturers, logistics companies, and government
 * systems." — CIM Volume III §9. This is where a business gets the credential
 * that makes that real for them.
 */
export default async function PartnerApiPage() {
  await requireUser('/partner/api')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const [keys, usage] = await Promise.all([listKeys(org.id), keyUsage(org.id, 24)])
  const usageById = new Map(usage.map((row) => [row.api_key_id, row]))

  const active = keys.filter((key) => key.status === 'active')
  const calls = usage.reduce((sum, row) => sum + row.calls, 0)
  const errors = usage.reduce((sum, row) => sum + row.errors, 0)

  return (
    <PartnerShell active="/partner/api">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'API access' }]}
          title="API access"
          subtitle={`Connect ${org.name} to your own systems — an ERP, a till, a stock sheet or a mobile app. Keys act only for this business and only within the scopes you grant.`}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Active keys" value={active.length} icon="lock" />
          <Stat label="Calls (24h)" value={calls} icon="pulse" />
          <Stat
            label="Errors (24h)"
            value={errors}
            tone={errors > 0 ? 'danger' : 'neutral'}
            hint={calls ? `${Math.round((errors / calls) * 100)}% of calls` : 'No traffic yet'}
          />
          <Stat label="Rate limit" value="120/min" hint="Per key, by default" icon="clock" />
        </div>

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_21rem]">
          <div className="space-y-4">
            <Card>
              <SectionHeading
                title="Your keys"
                subtitle="A revoked key stops working immediately"
              />
              {keys.length ? (
                <div className="scroll-x">
                  <table className="w-full min-w-[32rem] text-sm">
                    <caption className="sr-only">API keys issued for this business</caption>
                    <thead>
                      <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3 font-medium">Key</th>
                        <th className="py-2 pr-3 font-medium">Scopes</th>
                        <th className="py-2 pr-3 text-right font-medium">Calls 24h</th>
                        <th className="py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key.id} className="border-b border-line-soft last:border-0">
                          <td className="py-2.5 pr-3">
                            <span className="block text-ink">{key.name}</span>
                            <span className="block font-technical text-xs text-muted">
                              {key.prefix}…
                            </span>
                            {key.status === 'revoked' && (
                              <Badge tone="neutral" className="mt-1">
                                Revoked
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="flex flex-wrap gap-1">
                              {key.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="rounded bg-surface-muted px-1.5 py-0.5 font-technical text-[11.2px] text-muted"
                                >
                                  {scope}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-muted">
                            {usageById.get(key.id)?.calls ?? 0}
                          </td>
                          <td className="py-2.5 text-right">
                            {key.status === 'active' && <RevokeKeyButton keyId={key.id} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon="lock"
                  title="No keys yet"
                  body="Create one to connect your own systems to AfriMesh."
                />
              )}
            </Card>

            <Card>
              <SectionHeading title="Using the API" subtitle="Send the key as a bearer token" />
              <pre className="scroll-x rounded-brand bg-surface-deep p-4 font-technical text-xs leading-relaxed text-white">
                {`curl https://<your-host>/api/v1/inventory \\
  -H "Authorization: Bearer am_live_…"

{
  "data": [ { "id": "…", "product": { … }, "stock": { … } } ],
  "meta": { "requestId": "…" }
}`}
              </pre>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="font-technical text-xs text-muted">GET /api/v1/inventory</dt>
                  <dd className="text-xs text-muted">your stock, prices and reorder levels</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-technical text-xs text-muted">GET /api/v1/orders</dt>
                  <dd className="text-xs text-muted">orders placed with you</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                Every response carries a request id in the body and the{' '}
                <code className="font-technical">X-Request-Id</code> header. Quote it in support and
                we can find the exact call.
              </p>
            </Card>
          </div>

          <Card>
            <SectionHeading title="Create a key" subtitle="Shown once, stored hashed" />
            <IssueKeyForm
              scopes={API_SCOPES.map((scope) => ({ value: scope, label: SCOPE_LABEL[scope] }))}
            />
          </Card>
        </div>
      </div>
    </PartnerShell>
  )
}
