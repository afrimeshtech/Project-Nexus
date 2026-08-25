import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Statement } from '@/components/commerce/Statement'
import { TopUpForm, WithdrawForm } from '@/components/commerce/WalletForms'
import { Card, PageHeader, SectionHeading, Stat } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { getBalance, statement } from '@/modules/wallet/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Wallet' }

export default async function WalletPage() {
  const user = await requireUser('/wallet')
  const wallet = await getBalance('user', user.id)
  const lines = await statement(wallet.id, 40)

  return (
    <ConsumerShell search={false}>
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Wallet' }]}
          title="Your wallet"
          subtitle="One balance for paying, refunds and rewards across the network"
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Available" value={formatMoney(wallet.available)} />
          <Stat
            label="In escrow"
            value={formatMoney(wallet.locked)}
            hint="Held on orders not yet delivered"
          />
          <Stat label="Total balance" value={formatMoney(wallet.balance)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card>
            <SectionHeading
              title="Statement"
              subtitle="Every line is a double-entry ledger record"
            />
            <Statement lines={lines} />
          </Card>

          <div className="space-y-4">
            <Card>
              <SectionHeading title="Add money" />
              <TopUpForm />
            </Card>
            <Card>
              <SectionHeading title="Withdraw" />
              <WithdrawForm />
            </Card>
          </div>
        </div>
      </div>
    </ConsumerShell>
  )
}
