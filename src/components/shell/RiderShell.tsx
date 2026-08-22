import Link from 'next/link'
import { Wordmark } from '@/components/brand/Logo'
import { logoutAction } from '@/app/actions/session'

/**
 * The delivery partner's chrome.
 *
 * Every other dashboard puts a "Storefront" link here, into the product
 * catalogue. A rider has no use for it — they never buy anything, and browsing
 * categories tells them nothing about where to be. Their equivalent is the
 * network map: the shops, warehouses and drop points they actually ride
 * between.
 */
export function RiderShell({
  children,
  name,
  locationLabel,
  active,
}: {
  children: React.ReactNode
  name: string
  locationLabel: string
  active: '/rider' | '/rider/map'
}) {
  const nav = [
    { href: '/rider', label: 'Deliveries' },
    { href: '/rider/map', label: 'Network map' },
  ] as const

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-bar">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/rider">
              <Wordmark size="sm" priority />
            </Link>
            <nav aria-label="Delivery partner" className="flex gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active === item.href ? 'page' : undefined}
                  className={`rounded-brand px-3 py-1.5 text-sm font-medium ${
                    active === item.href
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-right">
              <span className="block text-sm font-semibold text-white">{name}</span>
              <span className="block text-xs text-white/70">
                Delivery partner · {locationLabel}
              </span>
            </span>
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

      <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">{children}</main>
    </div>
  )
}
