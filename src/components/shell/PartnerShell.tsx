import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import { Wordmark } from '@/components/brand/Logo'
import { Badge } from '@/components/ui'
import { logoutAction } from '@/app/actions/session'
import { currentOrganisation, currentUser } from '@/lib/auth'
import { ORG_LABEL, type OrgType } from '@/lib/tiers'
// FUTURE-DASHBOARD: both of these fed the sourcing nav entry only.
// import { ORG_LABEL, supplierTypeFor, type OrgType } from '@/lib/tiers'
// import { cartCount } from '@/lib/cart'
import { unreadMessageCount } from '@/modules/messaging/service'
import { audienceForSeller } from '@/modules/territory/service'

/**
 * Dashboard shell for a selling organisation.
 *
 * Written to adapt to the organisation's position in the supply chain — you
 * sell downstream, you source upstream, you hold a wallet. At launch only the
 * retail outlet tier exists, so the downstream half is all that is wired up;
 * see the FUTURE-DASHBOARD notes below for what comes back with the upper
 * tiers.
 */
export async function PartnerShell({
  children,
  active,
}: {
  children: React.ReactNode
  active: string
}) {
  // FUTURE-DASHBOARD: `basket` was the sourcing cart's badge count.
  // const [user, org, basket] = await Promise.all([
  //   currentUser(),
  //   currentOrganisation(),
  //   cartCount(),
  // ])
  const [user, org] = await Promise.all([currentUser(), currentOrganisation()])
  if (!org || !user) return null

  const unreadMessages = await unreadMessageCount(user.id, org.id)

  /*
   * FUTURE-DASHBOARD: which tier this organisation restocks from.
   *
   * Registration is closed above the retail outlet tier, and an outlet sources
   * from merchants — so for anyone who can sign up today the sourcing nav below
   * would point at a page that can only ever be empty.
   *
   * const supplier = supplierTypeFor(org.tier_level)
   */

  /*
   * `sellsTo` is deliberately NOT collapsed to a constant.
   *
   * Closing registration does not delete the organisations that already exist —
   * a deployment seeded before the tiers were switched off, or one that has
   * been running, still has merchant and warehouse accounts, and they still
   * authenticate. They land here. Hardcoding 'consumers' would label a
   * merchant's inbox "Orders from consumers", which is simply wrong: a merchant
   * sells to retail outlets.
   *
   * The org's own type is the honest answer whatever is open for registration,
   * so it stays the source of truth.
   */
  const sellsTo =
    org.type === 'outlet'
      ? 'consumers'
      : org.type === 'merchant'
        ? 'retail outlets'
        : org.type === 'warehouse'
          ? 'merchants'
          : 'dealer warehouses'

  const nav: { href: string; label: string; icon: IconName; badge?: number }[] = [
    { href: '/partner', label: 'Overview', icon: 'chart' },
    { href: '/partner/orders', label: `Orders from ${sellsTo}`, icon: 'inbox' },
    { href: '/partner/inventory', label: 'Inventory', icon: 'box' },
    // Shown only where there is a tier below to read demand from — a delivery
    // partner organisation sells to nobody, so the page would be empty.
    ...(audienceForSeller(org.type)
      ? [{ href: '/partner/locations', label: 'Buyer locations', icon: 'pin' as const }]
      : []),
    { href: '/partner/catalogue', label: 'Add products', icon: 'plus' },
    // FUTURE-DASHBOARD: one-tap restocking from the tier above. /partner/source
    // and the restock services are untouched and still build — this link is
    // hidden only because there is no supplier tier to source from yet.
    //
    // ...(supplier
    //   ? [
    //       {
    //         href: '/partner/source',
    //         label: `Source from ${ORG_LABEL[supplier].toLowerCase()}s`,
    //         // Annotated because the spread of this conditional array would
    //         // otherwise widen `icon` to `string` for the whole literal.
    //         icon: 'refresh' as IconName,
    //         badge: basket,
    //       },
    //     ]
    //   : []),
    { href: '/messages', label: 'Messages', icon: 'chat', badge: unreadMessages },
    { href: '/partner/wallet', label: 'Wallet', icon: 'wallet' },
    { href: '/partner/rewards', label: 'Rewards', icon: 'star-filled' },
    { href: '/partner/api', label: 'API access', icon: 'lock' },
    { href: '/partner/settings', label: 'Settings', icon: 'settings' },
  ]

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-bar">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/partner">
            <Wordmark size="sm" priority />
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{org.name}</p>
              <p className="text-xs text-white/70">
                {ORG_LABEL[org.type as OrgType]} · tier {org.tier_level}
              </p>
            </div>
            {org.verification === 'verified' ? (
              <Badge tone="brand">Verified</Badge>
            ) : (
              <Badge tone="warning">Pending review</Badge>
            )}
            <Link
              href="/"
              className="rounded-brand px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10"
            >
              Storefront
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-brand px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {org.verification !== 'verified' && (
        <div className="border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-center text-sm text-warning-ink">
          Your business is awaiting verification. You can add inventory now — listings become
          discoverable to buyers once an administrator approves you.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-8">
        <nav aria-label="Dashboard" className="hidden w-56 shrink-0 lg:block">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active === item.href ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-brand px-3 py-2 text-sm transition-colors ${
                    active === item.href
                      ? 'bg-accent-soft font-semibold text-accent-500'
                      : 'text-muted hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && item.badge > 0 && (
                    <span className="pill-notify">{item.badge}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <nav aria-label="Dashboard" className="scroll-x mb-4 lg:hidden">
            <ul className="flex gap-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                      active === item.href
                        ? 'bg-accent-500 text-accent-ink'
                        : 'border border-line bg-surface text-muted'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {children}
        </main>
      </div>
    </div>
  )
}
