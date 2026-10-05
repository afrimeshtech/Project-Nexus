import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import { Wordmark } from '@/components/brand/Logo'
import { Badge } from '@/components/ui'
import { logoutAction } from '@/app/actions/session'
import { currentUser } from '@/lib/auth'
import { RANKING_LAUNCHED } from '@/lib/launch-ranking'

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin', label: 'Overview', icon: 'chart' },
  { href: '/admin/organisations', label: 'Businesses', icon: 'store' },
  { href: '/admin/products', label: 'Catalogue', icon: 'tag' },
  { href: '/admin/locations', label: 'Demand map', icon: 'pin' },
  // FUTURE-RANKING: the weights console, once the weights order anything.
  ...(RANKING_LAUNCHED
    ? [{ href: '/admin/ranking', label: 'Ranking engine', icon: 'scale' as const }]
    : []),
  { href: '/admin/rewards', label: 'Referral programme', icon: 'star-filled' },
  { href: '/admin/fraud', label: 'Risk & fraud', icon: 'shield' },
  { href: '/admin/events', label: 'Event log', icon: 'list' },
  { href: '/admin/health', label: 'System health', icon: 'pulse' },
]

/** Platform console. Restricted to platform_admin, super_admin and auditor. */
export async function AdminShell({
  children,
  active,
}: {
  children: React.ReactNode
  active: string
}) {
  const user = await currentUser()
  if (!user) return null
  const readOnly = user.role === 'auditor'

  return (
    <div className="min-h-screen bg-page">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="bg-bar">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <Wordmark size="sm" priority />
            <span className="font-technical text-xs uppercase tracking-widest text-accent-400">
              Console
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge tone={readOnly ? 'warning' : 'brand'}>
              {user.role.replace(/_/g, ' ')}
              {readOnly && ' · read only'}
            </Badge>
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

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-8">
        <nav aria-label="Console" className="hidden w-52 shrink-0 lg:block">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active === item.href ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-brand px-3 py-2 text-sm transition-colors ${
                    active === item.href
                      ? 'bg-accent-soft font-semibold text-accent-strong'
                      : 'text-muted hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1">
          <nav aria-label="Console" className="scroll-x mb-4 lg:hidden">
            <ul className="flex gap-2">
              {NAV.map((item) => (
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
