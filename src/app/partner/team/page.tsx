import { PartnerShell } from '@/components/shell/PartnerShell'
import { AddSalesRepForm, RemoveMemberButton } from '@/components/partner/TeamForms'
import { Badge, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui'
import { requireOrgCapability } from '@/lib/auth'
import { MEMBER_ROLE_LABEL } from '@/lib/org-access'
import { listTeam } from '@/modules/organisations/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team' }

/**
 * The owner's view of who works the business.
 *
 * What a rep can and cannot do is listed on the page itself, next to the form
 * that grants it: an owner adding someone should know exactly what they are
 * handing over, and that the money is not part of it.
 */
export default async function PartnerTeamPage() {
  const { org } = await requireOrgCapability('team', '/partner/team')
  const team = await listTeam(org.id)
  const reps = team.filter((member) => !member.is_owner)

  return (
    <PartnerShell active="/partner/team">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Team' }]}
          title="Team"
          subtitle={`The people who run ${org.name} with you.`}
        />

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_22rem]">
          <Card>
            <SectionHeading
              title="Members"
              subtitle={`${reps.length} sales rep${reps.length === 1 ? '' : 's'}`}
            />
            <ul className="divide-y divide-line-soft">
              {team.map((member) => (
                <li
                  key={member.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{member.full_name}</p>
                    <p className="font-technical text-xs text-muted">
                      {member.phone ?? '—'} ·{' '}
                      {member.last_login_at
                        ? `last signed in ${new Date(member.last_login_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`
                        : 'has not signed in yet'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={member.is_owner ? 'brand' : 'neutral'}>
                      {MEMBER_ROLE_LABEL[member.is_owner ? 'owner' : 'sales_rep']}
                    </Badge>
                    {!member.is_owner && (
                      <RemoveMemberButton userId={member.user_id} name={member.full_name} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {reps.length === 0 && (
              <EmptyState
                icon="user"
                title="No sales reps yet"
                body="Add the people behind your counter so they can restock and fulfil orders from their own phones."
              />
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <SectionHeading title="Add a sales rep" />
              <AddSalesRepForm />
            </Card>

            <Card>
              <SectionHeading title="What a sales rep can do" />
              <ul className="space-y-1.5 text-sm text-ink">
                <li>Add products and set their prices</li>
                <li>Restock and correct stock counts</li>
                <li>Accept, prepare and cancel orders</li>
                <li>Dispatch orders to a delivery rider</li>
                <li>Message buyers about their orders</li>
              </ul>
              <p className="mt-3 border-t border-line-soft pt-3 text-sm text-muted">
                They cannot see or move money: the wallet, withdrawals, revenue figures and reward
                points stay with you, as do the stock movement log, buyer analytics, business
                settings and API keys.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PartnerShell>
  )
}
