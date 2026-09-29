import Link from 'next/link'
import { HeaderMenu } from '@/components/shell/HeaderMenu'
import { StickyHeaderSentinel } from '@/components/shell/StickyHeaderSentinel'
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
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {/* The bar carries the logo artwork's own background, so the lockup sits
          in it with no visible edge. Text on it is the logo's white. */}
      {/* The bar casts onto the content below it, so the page reads as three
          layers — chrome, content, chrome — rather than three flat bands. */}

      {/* Sits immediately above the header so the observer can tell when the
          header has pinned. One pixel, no visual effect. */}
      <StickyHeaderSentinel headerId="site-header" />

      {/*
       * Pinned, because search lives in here.
       *
       * On a phone the bottom navigation has no search entry — it is at its
       * five-item limit — so once a shopper scrolled a results page, the only
       * route back to the search field was scrolling all the way up. For a
       * storefront whose whole proposition is "search what is near you", that
       * is the one control that should never leave.
       *
       * It condenses when pinned rather than taking the full 165px it needs in
       * flow, which is 26% of a phone viewport. `data-stuck` is set by the
       * sentinel above; the rules that read it are on the two rows below.
       */}
      <header
        id="site-header"
        className="bar-depth group sticky top-0 border-b border-bar-line bg-bar"
        style={{ zIndex: 'var(--z-bar)' }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-3 transition-[padding] duration-200 group-data-[stuck]:py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Menu leads on the left, then the lockup. */}
            <div className="flex items-center gap-3">
              <HeaderMenu
                accountLabel={user ? user.full_name : 'AfriMesh'}
                links={[
                  // First, so the way back to the storefront is one tap from
                  // anywhere. The logo also leads home, but nothing says so,
                  // and on a desktop there is no bottom nav with a Home tab.
                  { href: '/', label: 'Shop', icon: 'home' as const },
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
                  { href: '/contact?from=consumer', label: 'Contact us', icon: 'mail' as const },
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

              <Link href="/" aria-label="AfriMesh home" className="flex min-h-11 items-center">
                <Wordmark size="sm" priority />
              </Link>
            </div>

            <div className="hidden sm:block">
              <LocationPicker label={location.label} areas={KNOWN_AREAS} />
            </div>

            {/* 44px targets, 8px apart.
                These are the most-tapped controls in the app and they sit at
                the top of the screen, where thumb reach is already worst. They
                were 40px with a 6px gap — inside WCAG's 24px floor, but under
                the 44/48px both platform guidelines ask for, on a product whose
                buyers are shopping one-handed in a market. */}
            {/* Hover shifts the ground, it does not grow the button. A 10%
                scale on a 44px target moves its edges ~4px while the pointer
                is on it, and three of them side by side made the bar twitch
                on the way past. The background change says "this is live"
                without anything moving. */}
            <nav className="flex items-center gap-2 text-sm">
              <Link
                href="/messages"
                className="press relative grid size-11 place-items-center rounded-brand border border-bar-line text-bar-ink transition-colors hover:bg-bar-line/60 active:press-active"
              >
                <Icon name="chat" />
                <span className="sr-only">Messages</span>
                {unreadMessages > 0 && (
                  <span className="pill-notify absolute -right-1 -top-1">{unreadMessages}</span>
                )}
              </Link>
              <Link
                href="/notifications"
                className="press relative grid size-11 place-items-center rounded-brand border border-bar-line text-bar-ink transition-colors hover:bg-bar-line/60 active:press-active"
              >
                <Icon name="bell" />
                <span className="sr-only">Notifications</span>
                {unread > 0 && (
                  <span className="pill-notify absolute -right-1 -top-1">{unread}</span>
                )}
              </Link>
              <Link
                href="/cart"
                className="press relative grid size-11 place-items-center rounded-brand border border-bar-line text-bar-ink transition-colors hover:bg-bar-line/60 active:press-active"
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
                  className="hidden min-h-11 items-center rounded-brand bg-accent-500 px-3.5 font-semibold text-accent-ink transition-colors hover:bg-accent-600 sm:flex"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </div>

          {/* Where you are is context, not an action — the first thing that can
              be spared when the bar has to earn its height. Mobile only; on a
              wider screen it sits inline in the row above and never moves. */}
          <div className="mt-3 sm:hidden group-data-[stuck]:hidden">
            <LocationPicker label={location.label} areas={KNOWN_AREAS} />
          </div>

          {search && (
            <div className="mt-3">
              <SearchBar />
            </div>
          )}
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-7 sm:pb-14"
      >
        {children}
      </main>

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
  //
  // Floating rather than flush: inset 0.75rem (Tailwind's `3`) on every edge,
  // radius-card rather than a bespoke value so it stays on the three-radii
  // scale, shadow flipped to `bar-depth-float` since it no longer touches an
  // edge for `bar-depth-top`'s upward cast to make sense against. Labels stay
  // under every icon — that's why Recognition Rather Than Recall scores well
  // here, and a floating shape isn't a reason to give it up.
  return (
    <nav
      aria-label="Primary"
      className="bar-depth-float fixed inset-x-3 bottom-3 rounded-card border border-bar-line bg-bar sm:hidden"
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
        <Link href="/contact?from=consumer" className="font-medium text-bar-ink hover:underline">
          Contact us
        </Link>
      </div>
    </footer>
  )
}
