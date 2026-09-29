import { Badge } from '@/components/ui'
import { formatMoney } from '@/lib/money'
import type { Payout } from '@/modules/payouts/service'

const STATUS: Record<Payout['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> =
  {
    processing: { label: 'Processing', tone: 'warning' },
    paid: { label: 'Sent', tone: 'success' },
    failed: { label: 'Returned', tone: 'danger' },
  }

/** Recent withdrawals, so a pending one is visible until the bank confirms it. */
export function PayoutHistory({ payouts }: { payouts: Payout[] }) {
  if (payouts.length === 0) return null
  return (
    <div className="border-t border-line-soft pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Recent withdrawals
      </p>
      <ul className="space-y-2">
        {payouts.map((payout) => (
          <li key={payout.id} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-ink">{formatMoney(payout.amount)}</span>
              <span className="block truncate text-xs text-muted">
                {payout.bank_name} ····{payout.account_number.slice(-4)} ·{' '}
                {new Date(payout.created_at).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              {payout.status === 'failed' && payout.failure_reason && (
                <span className="block text-xs text-muted">
                  Back in your wallet: {payout.failure_reason}
                </span>
              )}
            </span>
            <Badge className="shrink-0" tone={STATUS[payout.status].tone}>
              {STATUS[payout.status].label}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
