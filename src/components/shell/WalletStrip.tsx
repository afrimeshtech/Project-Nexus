import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { formatMoney } from '@/lib/money'

/**
 * The balance as a pill inside the header bar, on both dashboards. On a
 * phone it sits at the right of the location row, directly under the
 * messages, notifications and basket icons; on a wider screen, where the
 * location moves into the top row, it sits just before those icons.
 */
export function WalletPill({
  available,
  href,
  className = '',
}: {
  available: number
  href: string
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={`Wallet balance ${formatMoney(available)}`}
      className={`press min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-bar-line px-3 text-xs text-bar-ink transition-colors hover:bg-bar-line/60 ${className}`}
    >
      <Icon name="wallet" size={14} className="shrink-0 text-bar-muted" />
      <span className="font-technical font-semibold tabular-nums">{formatMoney(available)}</span>
    </Link>
  )
}
