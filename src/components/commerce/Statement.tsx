import { formatMoney } from '@/lib/money'
import { formatPoints } from '@/lib/points'
import { EmptyState } from '@/components/ui'
import type { StatementLine } from '@/modules/wallet/service'

const TYPE_LABEL: Record<string, string> = {
  deposit: 'Top-up',
  withdrawal: 'Withdrawal',
  transfer: 'Transfer',
  order_payment: 'Order payment',
  settlement: 'Settlement',
  platform_fee: 'Platform fee',
  refund: 'Refund',
  escrow_hold: 'Held in escrow',
  escrow_release: 'Released from escrow',
  cashback: 'Cashback',
  referral_reward: 'Referral reward',
  points_redemption: 'Points converted',
}

/**
 * Wallet statement, straight from the double-entry ledger.
 *
 * The points ledger is the same ledger in a different currency, so it renders
 * through the same table — only the unit changes.
 */
export function Statement({
  lines,
  unit = 'money',
}: {
  lines: StatementLine[]
  unit?: 'money' | 'points'
}) {
  const format = unit === 'points' ? formatPoints : formatMoney

  if (!lines.length) {
    return (
      <EmptyState
        icon="receipt"
        title="No transactions yet"
        body={
          unit === 'points'
            ? 'Reward points you earn will show here.'
            : 'Your wallet activity will show here.'
        }
      />
    )
  }

  return (
    <div className="scroll-x">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Wallet statement</caption>
        <thead>
          <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-line-soft last:border-0">
              <td className="whitespace-nowrap py-2.5 pr-3 font-technical text-xs text-muted">
                {new Date(line.created_at).toLocaleDateString('en-NG', {
                  day: '2-digit',
                  month: 'short',
                })}
              </td>
              <td className="py-2.5 pr-3">
                <span className="block text-ink">{TYPE_LABEL[line.type] ?? line.type}</span>
                <span className="block text-xs text-muted">{line.narration ?? line.reference}</span>
              </td>
              <td
                className={`whitespace-nowrap py-2.5 pr-3 text-right font-medium ${
                  line.direction === 'credit' ? 'text-accent-strong' : 'text-ink'
                }`}
              >
                {line.direction === 'credit' ? '+' : '−'}
                {format(line.amount)}
              </td>
              <td className="whitespace-nowrap py-2.5 text-right text-muted">
                {format(line.balance_after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
