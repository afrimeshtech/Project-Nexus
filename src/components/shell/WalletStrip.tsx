import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { formatMoney } from '@/lib/money'

/**
 * The wallet balance, as a thin strip above the header bar.
 *
 * Money is what a shopper checks before they buy and what a retailer checks
 * after they sell, so it is on every page rather than one menu tap away - but
 * as a slim line of its own, so the bar below keeps its room on a phone. It
 * scrolls away with the page; the header underneath is the part that pins.
 *
 * Right-aligned, so the balance sits directly above the bar's own icons
 * (messages, notifications, basket) - the corner where a person already looks
 * for "what is waiting for me". The padding matches each header's, so the
 * chevron lines up with the last icon below it.
 *
 * The whole strip is the link to the wallet. Only the available balance is
 * the headline: escrow is money that is not spendable yet, so it is named as
 * such rather than added in.
 */
export function WalletStrip({
  label,
  available,
  locked = 0,
  href,
  fullWidth = false,
}: {
  label: string
  available: number
  locked?: number
  href: string
  /** Edge to edge, for a full-width dashboard; otherwise the storefront column. */
  fullWidth?: boolean
}) {
  return (
    <Link
      href={href}
      className="block border-b border-bar-line bg-bar text-bar-muted transition-colors hover:text-bar-ink"
    >
      <div
        className={`flex w-full items-center justify-end gap-2 py-1.5 text-xs ${
          fullWidth ? 'px-4 sm:px-6' : 'mx-auto max-w-6xl px-4'
        }`}
      >
        <Icon name="wallet" size={14} className="shrink-0" />
        <span>{label}</span>
        <span className="font-technical font-semibold tabular-nums text-bar-ink">
          {formatMoney(available)}
        </span>
        {locked > 0 && (
          <span className="hidden truncate min-[380px]:inline">
            · {formatMoney(locked)} in escrow
          </span>
        )}
        <Icon name="chevron-down" size={14} className="shrink-0 -rotate-90" />
      </div>
    </Link>
  )
}
