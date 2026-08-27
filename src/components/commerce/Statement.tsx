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
    <>
      {/*
       * Below `sm` the ledger is a stacked list, not a 34rem table in a
       * scroller. DESIGN.md's No Horizontal Scroll Rule does allow a wide
       * table to scroll inside its own container, and that is what this was —
       * but the Phone-First Shell Rule outranks it here: on a 360px screen the
       * card is ~296px wide, so Amount and Balance both began off the right
       * edge, behind a sideways scroll a shopkeeper has to discover. Amount is
       * the column the whole screen exists for. Same data, same order, same
       * ledger — only the shape changes.
       */}
      <ul className="sm:hidden">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-start justify-between gap-3 border-b border-line-soft py-3 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-sm text-ink">{TYPE_LABEL[line.type] ?? line.type}</p>
              <p className="truncate text-xs text-muted">{line.narration ?? line.reference}</p>
              <p className="mt-0.5 font-technical text-xs text-muted">
                {new Date(line.created_at).toLocaleDateString('en-NG', {
                  day: '2-digit',
                  month: 'short',
                })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={`whitespace-nowrap text-sm font-medium tabular-nums ${
                  line.direction === 'credit' ? 'text-accent-strong' : 'text-ink'
                }`}
              >
                {line.direction === 'credit' ? '+' : '−'}
                {format(line.amount)}
              </p>
              <p className="whitespace-nowrap font-technical text-xs tabular-nums text-muted">
                {format(line.balance_after)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden scroll-x sm:block">
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
                  <span className="block text-xs text-muted">
                    {line.narration ?? line.reference}
                  </span>
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
    </>
  )
}
