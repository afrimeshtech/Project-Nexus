import Link from 'next/link'
import { HeaderMenu } from '@/components/shell/HeaderMenu'
import { Icon, type IconName } from '@/components/Icon'
import { Wordmark } from '@/components/brand/Logo'
import { SearchBar } from '@/components/shell/SearchBar'
import { LocationPicker } from '@/components/shell/LocationPicker'
import { currentUser, currentOrganisation } from '@/lib/auth'
import { buyerLocation, KNOWN_AREAS } from '@/lib/location'
import { cartCount } from '@/lib/cart'
import { unreadCount } from '@/modules/notifications/service'
import { unreadMessageCount } from '@/modules/messaging/service'
import { ADMIN_ROLES } from '@/lib/auth'

/**
 * The consumer-facing shell. Mobile-first (PRD Core Principles): a bottom tab
 * bar on small screens, a conventional header on larger ones, and a single
 * prominent search field because product discovery is the primary job.
 */
export async function ConsumerShell({
  children,
  search = true,
}: {
  children: React.ReactNode
  search?: boolean
}) {
  const [user, org, location, basket] = await Promise.all([
    currentUser(),
    currentOrganisation(),
    buyerLocation(),
    cartCount(),
  ])
  const [unread, unreadMessages] = user
    ? await Promise.all([unreadCount(user.id), unreadMessageCount(user.id, org?.id ?? null)])
    : [0, 0]
  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false
  // FUTURE-DASHBOARD: delivery partner.
  // const isRider = user?.role === 'delivery_partner'

  return (
    /* The tinted ground, not white. Cards carry a hairline and no shadow now,
       and a white card on a white page has nothing to be a card against — the
       ground is what makes the boundary legible rather than the border alone. */
    <div className="flex min-h-screen flex-col bg-page">
      {/* The bar carries the logo artwork's own background, so the lockup sits
          in it with no visible edge. Text on it is the logo's white. */}
      {/* The bar casts onto the content below it, so the page reads as three
          layers — chrome, content, chrome — rather than three flat bands. */}
      <header
        className="bar-depth relative border-b border-bar-line bg-bar"
        style={{ zIndex: 'var(--z-bar)' }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Menu leads on the left, then the lockup. */}
            <div className="flex items-center gap-3">
              <HeaderMenu
                accountLabel={user ? user.full_name : 'AfriMesh'}
                links={[
                  ...(user
                    ? [{ href: '/account', label: 'Your account', icon: 'user' as const }]
                    : [{ href: '/login', label: 'Sign in', icon: 'user' as const }]),
                  { href: '/orders', label: 'Orders', icon: 'box' as const },
                  { href: '/wallet', label: 'Wallet', icon: 'wallet' as const },
                  { href: '/rewards', label: 'Rewards', icon: 'star-filled' as const },
                  { href: '/favourites', label: 'Saved', icon: 'bookmark' as const },
                  {
                    href: '/messages',
                    label: 'Messages',
                    icon: 'chat' as const,
                    badge: unreadMessages,
                  },
                  {
                    href: '/notifications',
                    label: 'Notifications',
                    icon: 'bell' as const,
                    badge: unread,
                  },
                  ...(org ? [{ href: '/partner', label: org.name, icon: 'store' as const }] : []),
                  // FUTURE-DASHBOARD: the delivery partner's own surface. The
                  // /rider routes still exist and still guard on the role — this
                  // is the only link that ever led anyone to them.
                  // ...(isRider
                  //   ? [{ href: '/rider', label: 'Deliveries', icon: 'scooter' as const }]
                  //   : []),
                  ...(isAdmin
                    ? [{ href: '/admin', label: 'Platform console', icon: 'settings' as const }]
                    : []),
                  { href: '/about', label: 'How the network works', icon: 'info' as const },
                  ...(org
                    ? []
                    : [
                        {
                          href: '/onboarding',
                          label: 'Register a business',
                          icon: 'store' as const,
                        },
                      ]),
                ]}
              />

              <Link href="/" aria-label="AfriMesh home">
                <Wordmark size="sm" priority />
              </Link>
            </div>

            <div className="hidden sm:block">
              <LocationPicker label={location.label} areas={KNOWN_AREAS} />
            </div>

            <nav className="flex items-center gap-1.5 text-sm">
              <Link
                href="/messages"
                className="press relative grid size-10 place-items-center rounded-brand border border-bar-line text-bar-ink transition-[background-color,transform] hover:scale-110 hover:bg-bar-line/60 active:press-active"
              >
                <Icon name="chat" />
                <span className="sr-only">Messages</span>
                {unreadMessages > 0 && (
                  <span className="pill-notify absolute -right-1 -top-1">{unreadMessages}</span>
                )}
              </Link>
              <Link
                href="/notifications"
                className="press relative grid size-10 place-items-center rounded-brand border border-bar-line text-bar-ink transition-[background-color,transform] hover:scale-110 hover:bg-bar-line/60 active:press-active"
              >
                <Icon name="bell" />
                <span className="sr-only">Notifications</span>
                {unread > 0 && (
                  <span className="pill-notify absolute -right-1 -top-1">{unread}</span>
                )}
              </Link>
              <Link
                href="/cart"
                className="press relative grid size-10 place-items-center rounded-brand border border-bar-line text-bar-ink transition-[background-color,transform] hover:scale-110 hover:bg-bar-line/60 active:press-active"
              >
                <Icon name="basket" />
                <span className="sr-only">Basket</span>
                {basket > 0 && (
                  <span className="pill-notify absolute -right-1 -top-1">{basket}</span>
                )}
              </Link>

              {!user && (
                <Link
                  href="/login"
                  className="hidden rounded-brand bg-accent-500 px-3.5 py-2 font-semibold text-accent-ink transition-colors hover:bg-accent-600 sm:block"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </div>

          <div className="mt-3 sm:hidden">
            <LocationPicker label={location.label} areas={KNOWN_AREAS} />
          </div>

          {search && (
            <div className="mt-3">
              <SearchBar />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-7 sm:pb-14">{children}</main>

      <BottomNav messages={unreadMessages} />
      <SiteFooter />
    </div>
  )
}

/**
 * Primary tabs, matching the Project Nexus reference design:
 * Home · Orders · Wallet · Messages · Profile.
 *
 * Search and the basket live in the header instead — search because it is the
 * single most prominent control on every screen, and the basket because it
 * needs its running count visible while you browse, not one tap away.
 */
function BottomNav({ messages }: { messages: number }) {
  const items: { href: string; label: string; icon: IconName; badge?: number }[] = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/orders', label: 'Orders', icon: 'box' },
    { href: '/wallet', label: 'Wallet', icon: 'wallet' },
    { href: '/messages', label: 'Messages', icon: 'chat', badge: messages },
    { href: '/account', label: 'Profile', icon: 'user' },
  ]
  // On a phone this bar *is* the footer — the site footer is hidden below the
  // sm breakpoint — so it carries the same brand ground as the header.
  return (
    <nav
      aria-label="Primary"
      className="bar-depth-top fixed inset-x-0 bottom-0 border-t border-bar-line bg-bar sm:hidden"
      style={{ zIndex: 'var(--z-bottom-nav)' }}
    >
      <ul className="mx-auto flex max-w-6xl">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              className="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-bar-muted hover:text-bar-ink"
            >
              <Icon name={item.icon} size={22} />
              {item.label}
              {!!item.badge && item.badge > 0 && (
                <span className="pill-notify absolute right-1/4 top-0.5">{item.badge}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function SiteFooter() {
  return (
    // Same ground as the header, so the page is bracketed by the brand.
    <footer
      className="bar-depth-top relative mt-auto hidden bg-bar sm:block"
      style={{ zIndex: 'var(--z-bar)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-8 text-sm text-bar-muted">
        <Wordmark size="sm" orientation="stacked" />
        <p className="font-technical text-xs">
          AfriMesh Technologies · Project Nexus · Proximity Commerce &amp; Payment Infrastructure
        </p>
      </div>
    </footer>
  )
}
