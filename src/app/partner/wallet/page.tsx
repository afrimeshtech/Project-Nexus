import { PartnerShell } from '@/components/shell/PartnerShell'
import { Statement } from '@/components/commerce/Statement'
import { TopUpForm, WithdrawForm } from '@/components/commerce/WalletForms'
import { Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireOrgCapability } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { getBalance, statement } from '@/modules/wallet/service'
import { sellerKpis } from '@/modules/analytics/service'
import { listBankAccounts, listBanks, listPayouts } from '@/modules/payouts/service'
import { PayoutHistory } from '@/components/commerce/PayoutHistory'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Business wallet' }

export default async function PartnerWalletPage() {
  const { org } = await requireOrgCapability('funds', '/partner/wallet')

  const owner = { type: 'organisation' as const, id: org.id }
  const wallet = await getBalance('organisation', org.id)
  const [lines, kpis, accounts, banks, payouts] = await Promise.all([
    statement(wallet.id, 50),
    sellerKpis(org.id),
    listBankAccounts(owner),
    // A provider outage must not take the balance and statement down with it.
    listBanks().catch(() => []),
    listPayouts(owner, 5),
  ])

  return (
    <PartnerShell active="/partner/wallet">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Wallet' }]}
          title="Business wallet"
          subtitle="Sales settle here. Escrow releases when the buyer confirms delivery."
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Available"
            value={formatMoney(wallet.available)}
            hint="Ready to spend or withdraw"
          />
          <Stat
            label="In escrow"
            value={formatMoney(wallet.locked)}
            hint="Held on orders not yet delivered"
          />
          <Stat label="Total balance" value={formatMoney(wallet.balance)} />
          <Stat
            label="Lifetime revenue"
            value={formatMoney(kpis.revenue)}
            hint="Net of platform fees"
          />
        </div>

        <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1fr_20rem]">
          <Card>
            <SectionHeading
              title="Statement"
              subtitle="Every line is a double-entry ledger record — debits always equal credits"
            />
            <Statement lines={lines} />
          </Card>

          <div className="space-y-4">
            <Card>
              <SectionHeading title="Add money" subtitle="Fund restocking" />
              <TopUpForm scope="organisation" />
            </Card>
            <Card>
              <SectionHeading title="Withdraw" subtitle="To the business's bank account" />
              <div className="space-y-4">
                <WithdrawForm scope="organisation" accounts={accounts} banks={banks} />
                <PayoutHistory payouts={payouts} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PartnerShell>
  )
}
