import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import { Wordmark } from '@/components/brand/Logo'
import { Badge, Thumb, inputWithIconClass } from '@/components/ui'
import { logoutAction } from '@/app/actions/session'
import { currentOrganisation, currentUser } from '@/lib/auth'
import { ORG_LABEL, type OrgType } from '@/lib/tiers'
// FUTURE-DASHBOARD: both of these fed the sourcing nav entry only.
// import { ORG_LABEL, supplierTypeFor, type OrgType } from '@/lib/tiers'
// import { cartCount } from '@/lib/cart'
import { unreadMessageCount } from '@/modules/messaging/service'
import { audienceForSeller } from '@/modules/territory/service'

type NavItem = {
  href: string
  label: string
  /**
   * The tile face, where one line has to be enough. The full `label` stays as
   * the accessible name and the tooltip, and it always begins with this text —
   * so what is read aloud still matches what is on screen.
   */
  short?: string
  icon: IconName
  badge?: number
}

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

  /*
   * Two registers, not one flat list.
   *
   * `work` is where the day is spent — those get the tile grid. `account` is
   * where you go on purpose and rarely, so it stays a plain list below the
   * rule. Splitting them is what stops eleven identical rows reading as a wall.
   */
  const work: NavItem[] = [
    { href: '/partner', label: 'Overview', icon: 'chart' },
    { href: '/partner/orders', label: `Orders from ${sellsTo}`, short: 'Orders', icon: 'inbox' },
    { href: '/partner/inventory', label: 'Inventory', icon: 'box' },
    { href: '/partner/catalogue', label: 'Add products', icon: 'plus' },
    ...(audienceForSeller(org.type)
      ? [{ href: '/partner/locations', label: 'Buyer locations', icon: 'pin' as const }]
      : []),
    { href: '/messages', label: 'Messages', icon: 'chat', badge: unreadMessages },
  ]

  // FUTURE-DASHBOARD: one-tap restocking from the tier above. /partner/source
  // and the restock services are untouched and still build — this entry is
  // hidden only because there is no supplier tier to source from yet.
  //
  // ...(supplier
  //   ? [
  //       {
  //         href: '/partner/source',
  //         label: `Source from ${ORG_LABEL[supplier].toLowerCase()}s`,
  //         icon: 'refresh' as IconName,
  //         badge: basket,
  //       },
  //     ]
  //   : []),

  const account: NavItem[] = [
    { href: '/partner/wallet', label: 'Wallet', icon: 'wallet' },
    { href: '/partner/rewards', label: 'Rewards', icon: 'star-filled' },
    { href: '/partner/api', label: 'API access', icon: 'lock' },
    { href: '/partner/settings', label: 'Settings', icon: 'settings' },
  ]

  const nav = [...work, ...account]

  return (
    <div className="flex min-h-screen bg-page">
      {/*
       * The rail is its own scroll context and does not move with the page:
       * on a dashboard you navigate from wherever you have scrolled to, and a
       * sidebar that has to be scrolled back to is a sidebar you stop using.
       */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line-soft bg-surface lg:flex">
        {/*
         * The supplied logo crops are baked onto the artwork's own #021614
         * ground, so the mark gets a plate of that colour rather than being
         * pasted onto white as a dark rectangle. It is sized to the content
         * header opposite it, so the top of the app reads as one band.
         */}
        <div className="flex h-16 shrink-0 items-center bg-surface-deep px-4">
          <Link href="/partner" className="rounded-brand">
            <Wordmark size="sm" priority />
          </Link>
        </div>

        <div className="shrink-0 border-b border-line-soft px-3 py-2.5">
          <form action="/partner/inventory" className="field-with-icon">
            <Icon name="search" size={16} className="field-icon" />
            <input
              type="search"
              name="q"
              placeholder="Search inventory"
              aria-label="Search inventory"
              className={inputWithIconClass}
            />
          </form>
        </div>

        <nav aria-label="Dashboard" className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          <ul className="grid grid-cols-2 gap-2">
            {work.map((item) => {
              const current = active === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    title={item.label}
                    aria-label={item.short ? item.label : undefined}
                    className={`nav-tile ${current ? 'nav-tile-active' : 'hover:nav-tile-hover'}`}
                  >
                    <Icon name={item.icon} size={20} />
                    <span className="line-clamp-2">{item.short ?? item.label}</span>
                    {!!item.badge && item.badge > 0 && (
                      <span className="pill-notify-sm absolute right-1.5 top-1.5">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>

          <hr className="my-2.5 border-line-soft" />

          <ul className="space-y-0.5">
            {account.map((item) => {
              const current = active === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={`nav-row ${current ? 'nav-row-active' : 'hover:nav-row-hover'}`}
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Who is signed in, and the way out. Pinned to the foot of the rail
            because it is the one thing here that is not navigation. */}
        <div className="shrink-0 border-t border-line-soft px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Thumb src={null} alt={org.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{org.name}</p>
              <p className="truncate text-xs text-muted">
                {ORG_LABEL[org.type as OrgType]} · tier {org.tier_level}
              </p>
            </div>
          </div>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="nav-row w-full hover:nav-row-hover">
              <Icon name="arrow-left" size={17} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line-soft bg-surface px-4 sm:px-6"
          style={{ zIndex: 'var(--z-sticky)' }}
        >
          <Link href="/partner" className="lg:hidden">
            <span className="sr-only">AfriMesh partner dashboard</span>
            <Icon name="chart" size={22} className="text-brand-deep" />
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {org.verification === 'verified' ? (
              <Badge tone="success">Verified</Badge>
            ) : (
              <Badge tone="warning">Pending review</Badge>
            )}
            <Link
              href="/messages"
              className="icon-button hover:icon-button-hover relative"
              aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages'}
            >
              <Icon name="chat" size={18} />
              {unreadMessages > 0 && (
                <span className="pill-notify-sm absolute -right-1 -top-1">{unreadMessages}</span>
              )}
            </Link>
            <Link
              href="/"
              className="rounded-brand px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-ink"
            >
              Storefront
            </Link>
            <form action={logoutAction} className="lg:hidden">
              <button
                type="submit"
                className="rounded-brand px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {org.verification !== 'verified' && (
          <div className="border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-center text-sm text-warning-ink sm:px-6">
            Your business is awaiting verification. You can add inventory now — listings become
            discoverable to buyers once an administrator approves you.
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <nav aria-label="Dashboard" className="scroll-x mb-5 lg:hidden">
            <ul className="flex gap-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active === item.href ? 'page' : undefined}
                    className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                      active === item.href
                        ? 'bg-brand-deep text-white'
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
