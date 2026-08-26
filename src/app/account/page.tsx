import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Breadcrumb, Badge, Card, LinkButton, Stat, Thumb, SectionHeading } from '@/components/ui'
import { Icon, type IconName } from '@/components/Icon'
import { logoutAction } from '@/app/actions/session'
import { requireUser, currentOrganisation, ADMIN_ROLES } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { getBalance } from '@/modules/wallet/service'
import { pointsBalance, rewardsBeneficiary } from '@/modules/rewards/service'
import { formatPoints } from '@/lib/points'
import { consumerKpis } from '@/modules/analytics/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Account' }

export default async function AccountPage() {
  const user = await requireUser('/account')
  const [org, wallet, kpis, beneficiary] = await Promise.all([
    currentOrganisation(),
    getBalance('user', user.id),
    consumerKpis(user.id),
    rewardsBeneficiary(user.id),
  ])
  const points = await pointsBalance(beneficiary.type, beneficiary.id)

  /* Typed as IconName rather than left to infer `string`: these are keys into
     the icon set, and the whole reason they once rendered as the words "box"
     and "bell" is that nothing was checking they were. */
  const links: { href: string; label: string; icon: IconName; hint: string }[] = [
    { href: '/orders', label: 'Orders', icon: 'box', hint: 'Track and review your purchases' },
    { href: '/wallet', label: 'Wallet', icon: 'wallet', hint: 'Balance, top-ups and statements' },
    {
      href: '/rewards',
      label: 'Rewards',
      icon: 'star-filled',
      hint: 'Invite people and convert points to cash',
    },
    {
      href: '/favourites',
      label: 'Saved',
      // 'bookmark', matching the same entry in the header menu. Saved and
      // Rewards were both drawn with the star, which made two unrelated
      // destinations look like the same one.
      icon: 'bookmark',
      hint: 'Products and shops you keep coming back to',
    },
    {
      href: '/notifications',
      label: 'Notifications',
      icon: 'bell',
      hint: 'Order and account updates',
    },
  ]

  return (
    <ConsumerShell search={false}>
      <div className="space-y-8">
        {/* A page masthead rather than a card.
            The identity block used to sit in a bordered card like any other
            widget, which left the page with no title and no top edge — you
            landed straight on a row of numbers. Who the page is about is the
            heading, so it is set as one and separated by a rule. */}
        <Breadcrumb trail={[{ label: 'Home', href: '/' }, { label: 'Account' }]} />

        <header className="flex items-center gap-4 border-b border-line-soft pb-6">
          <Thumb alt={user.full_name} size="lg" rounded="rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="font-technical text-eyebrow uppercase text-accent-strong">Your account</p>
            <h1 className="mt-1 truncate text-display-sm text-ink">{user.full_name}</h1>
            <p className="mt-1 truncate text-sm text-muted">
              {[user.phone, user.email].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge tone="neutral">{user.role.replace(/_/g, ' ')}</Badge>
              {user.phone_verified && <Badge tone="brand">Phone verified</Badge>}
              <Badge tone="sand">Trust score {Number(user.trust_score).toFixed(0)}</Badge>
            </div>
          </div>
        </header>

        {/* Every figure gets a caption. A bare number under the word "Wallet"
            leaves the reader to work out whether it is spendable, owed, or
            lifetime volume — and on a wallet that is not a guess anyone should
            have to make. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Wallet" value={formatMoney(wallet.available)} hint="Available to spend" />
          <Stat label="In escrow" value={formatMoney(wallet.locked)} hint="Held until delivery" />
          <Stat
            label="Reward points"
            value={formatPoints(points.available)}
            hint={`Worth ${formatMoney(points.redeemableValue)}`}
            icon="star-filled"
          />
          <Stat label="Orders" value={kpis.orders} hint="Placed all time" />
          <Stat
            label="Saved items"
            value={kpis.saved_favourites}
            hint="Products and shops"
            icon="bookmark"
          />
        </div>

        <section>
          <p className="font-technical text-eyebrow uppercase text-muted">Quick access</p>
          {/* Four across on a wide screen rather than two. These are five short
              destinations, not content — at two columns they ran down half the
              page and pushed the rest below the fold. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="block h-full min-w-0">
                <Card className="flex h-full items-start gap-3 p-4 card-interactive hover:card-interactive-hover sm:p-5">
                  {/* An accent tint carries the icon rather than a grey outline.
                      On a page that is otherwise ink on white, this is the one
                      place a touch of the brand orange earns its keep. */}
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-brand bg-accent-soft text-accent-strong"
                  >
                    <Icon name={link.icon} size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{link.label}</p>
                    <p className="mt-0.5 text-xs text-muted">{link.hint}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading title="Business" />
          {org ? (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{org.name}</p>
                <p className="text-xs text-muted">
                  {org.type.replace('_', ' ')} · {org.verification}
                </p>
              </div>
              <LinkButton href="/partner" variant="secondary">
                Open dashboard
              </LinkButton>
            </Card>
          ) : (
            /* A band rather than a sixth hairline card.
               This is the only thing on the page asking for a decision, and it
               was drawn identically to the five links above it. Giving it the
               deep brand ground — the one element on the page that carries it —
               is what makes it read as an offer instead of another menu item.
               The ground and the mesh artwork are the brand's own forest green,
               not the blue of the reference mockup. */
            <div className="mesh-surface rounded-card px-6 py-8 sm:px-8 sm:py-10">
              <h3 className="text-heading text-white">Ready to start selling?</h3>
              <p className="mt-2 max-w-[46ch] text-sm text-white/80">
                {/* FUTURE-DASHBOARD: "Register a retail outlet, merchant business or
                    dealer warehouse." — restore as the upper tiers open. */}
                Register a retail outlet and reach buyers near you, with live inventory and
                settlement released on delivery.
              </p>
              <div className="mt-6">
                <LinkButton href="/onboarding">Register a business</LinkButton>
              </div>
            </div>
          )}
        </section>

        {ADMIN_ROLES.includes(user.role) && (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Platform console</p>
              <p className="text-xs text-muted">
                Verification queue, moderation, fraud monitoring and system health.
              </p>
            </div>
            <LinkButton href="/admin" variant="secondary">
              Open console
            </LinkButton>
          </Card>
        )}

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-brand border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-coral-ink hover:bg-coral/15"
          >
            Sign out
          </button>
        </form>
      </div>
    </ConsumerShell>
  )
}
