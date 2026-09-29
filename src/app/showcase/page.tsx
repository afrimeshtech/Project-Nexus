import Link from 'next/link'
import { Wordmark } from '@/components/brand/Logo'
import { Icon } from '@/components/Icon'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { LinkButton } from '@/components/ui'

export const metadata = {
  title: 'AfriMesh — Real stock, real shops, real fast',
  description:
    'See what verified sellers near you actually have on the shelf before you leave the house. Piloting now in Ikeja, Lagos.',
}

const NAV_LINKS = [
  { label: 'How it works', href: '/about' },
  { label: 'For sellers', href: '/onboarding' },
  { label: 'Verified shops', href: '/shops' },
  { label: 'Contact us', href: '/contact?from=showcase' },
]

// The grocery MVP's categories (src/lib/launch-categories.ts).
// FUTURE-CATEGORIES: 'Pharmacy', 'Building materials' - back when they launch.
const CATEGORY_RAIL = ['Groceries', 'Beverages']

/**
 * A standalone campaign surface — deliberately not `ConsumerShell`. The
 * shopping chrome (basket, bottom nav, search) belongs to the phone-first
 * utility app; this page is the thing that sends someone there, not the app
 * itself. See `docs/rabbit-pos-redesign-prompts.md` and DESIGN.md's Do's and
 * Don'ts for why nothing here touches the palette, the typeface, or the
 * Verified Stall system underneath it.
 *
 * The background is the brand's own drawn mesh (`mesh-surface`), not a
 * photograph — there is no real product photography yet, and a stock photo
 * of an unrelated market would be a worse anti-reference than no photo at
 * all. Every number on this page is either a real category name, a real
 * seeded outlet, or plainly illustrative UI chrome (a ring, a sparkline) —
 * nothing here claims a metric AfriMesh cannot back up. See PRODUCT.md:
 * "nothing may present pilot fixture data as evidence of traction."
 */
export default function ShowcasePage() {
  return (
    <div className="bg-bar">
      <section className="mesh-surface mesh-parallax relative flex min-h-screen flex-col overflow-hidden">
        {/* z-20, not z-10. The hero below is `relative z-10` too and comes
            later in the DOM, so at equal z-index it painted over the header —
            which took the mobile disclosure menu with it: opened on a phone,
            "Browse nearby stock" and "Sign in" rendered behind the headline
            and could not be tapped. The header owns the only sign-in route on
            a phone, so it outranks the hero. */}
        <header className="relative z-20 flex items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-6">
          <Link href="/" className="shrink-0">
            <Wordmark size="sm" orientation="horizontal" priority />
          </Link>

          <nav aria-label="Showcase" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Browsing without an account and signing in are different
                intents — secondary vs. primary keeps them visually distinct
                without a second orange fighting "Sign in" for the one accent
                the Rationed Accent Rule allows. Routed through /enter rather
                than straight to "/": a guest who clicks through should not
                be shown this same pitch again on their next visit — see
                middleware.ts and the afm_seen_landing cookie it checks.

                Visibility toggle lives on this wrapper, not on the buttons
                themselves: LinkButton's own base classes hardcode
                `inline-flex` unconditionally, and stacking a competing
                `hidden` at the same (unprefixed) cascade layer on the button
                is a coin flip — Tailwind resolves same-layer utility
                conflicts by source scan order, not by class-list order, so
                `inline-flex` was winning and showing both buttons below the
                sm breakpoint they were meant to disappear at. A wrapper with
                no competing display utility of its own doesn't have that
                fight. */}
            <div className="hidden items-center gap-2 sm:flex">
              <LinkButton href="/enter?next=/" variant="secondary">
                Browse nearby stock
              </LinkButton>
              <LinkButton href="/login" variant="primary">
                Sign in
              </LinkButton>
            </div>

            {/* A native disclosure rather than client state — a real,
                keyboard-accessible toggle with no JS required. */}
            <details className="group relative lg:hidden">
              <summary
                aria-label="Menu"
                className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-white/20 text-white [&::-webkit-details-marker]:hidden"
              >
                <Icon name="more" size={20} />
              </summary>
              <div className="glass-card absolute right-0 top-[calc(100%+0.5rem)] flex w-56 flex-col gap-1 p-3">
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-brand px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
                  >
                    {l.label}
                  </Link>
                ))}
                <LinkButton href="/enter?next=/" variant="secondary" className="mt-1">
                  Browse nearby stock
                </LinkButton>
                <LinkButton href="/login" variant="primary">
                  Sign in
                </LinkButton>
              </div>
            </details>
          </div>
        </header>

        <span
          aria-hidden
          className="absolute left-5 top-1/2 hidden size-1.5 -translate-y-1/2 rounded-full bg-white/30 lg:block"
        />
        <span
          aria-hidden
          className="absolute right-5 top-1/2 hidden size-1.5 -translate-y-1/2 rounded-full bg-white/30 lg:block"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-5 pb-16 pt-6 sm:px-8 lg:flex-row lg:items-center lg:gap-6 lg:pb-24">
          <div className="max-w-lg lg:w-2/5 lg:shrink-0">
            {/* Was a kicker above the h1 — DESIGN.md bans an eyebrow
                introducing a page heading. "Proximity commerce" is AfriMesh's
                own positioning line (PRODUCT.md), so it now reads as a
                caption under the headline instead of a label above it. */}
            <h1 className="text-display font-bold leading-[0.98] tracking-[-0.045em] text-white">
              Real stock.
              <br />
              Real shops.
              <br />
              Real fast.
            </h1>
            <p className="mt-3 flex items-center gap-2 font-technical text-[11px] uppercase tracking-[0.18em] text-white/60">
              <Icon name="pin" size={13} />
              Proximity commerce
            </p>
            <p className="mt-4 max-w-[38ch] text-base leading-relaxed text-white/75">
              See what verified sellers near you actually have on the shelf before you leave the
              house — paid for safely, delivered fast.
            </p>
            <p className="mt-3 font-technical text-xs uppercase tracking-[0.1em] text-white/50">
              Piloting now in Ikeja, Lagos
            </p>
            {/* Secondary here too, matching the nav: "Sign in" up top is the
                one orange action visible in this viewport. */}
            <LinkButton href="/login" variant="secondary" className="mt-6">
              Get started
            </LinkButton>
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5">
            {/* Card 1 — live order tracking. Not a claimed metric: an
                illustrative UI mockup, the same way a landing page shows a
                screenshot. Grace Stores is a real seeded outlet, reused
                rather than a made-up name. */}
            {/* Explicit height, not content-driven: this is the tall,
                near-square card in the stack — the ring is the focal
                element, so it gets room to breathe rather than a card sized
                tight to its content. */}
            <div
              className="glass-card rise-in flex h-56 w-full flex-col justify-between p-5"
              style={{ animationDelay: '80ms' }}
            >
              <div className="flex items-center justify-between">
                <p className="font-technical text-[11.2px] uppercase tracking-[0.12em] text-white/55">
                  Live order
                </p>
                <SellerThumb name="Grace Stores" type="outlet" size="sm" />
              </div>
              <div className="flex items-center gap-4">
                <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
                  <g transform="rotate(-90 44 44)">
                    <circle
                      cx="44"
                      cy="44"
                      r="34"
                      fill="none"
                      stroke="rgba(255,255,255,0.16)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="44"
                      cy="44"
                      r="34"
                      fill="none"
                      stroke="#ff9500"
                      strokeWidth="6"
                      strokeLinecap="round"
                      className="ring-progress"
                    />
                  </g>
                  <text
                    x="44"
                    y="44"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize="18"
                    fontWeight="700"
                    fontFamily="Inter, sans-serif"
                  >
                    68%
                  </text>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-white">Arriving in ~12 min</p>
                  <p className="mt-0.5 text-xs text-white/60">Grace Stores · 320 m away</p>
                </div>
              </div>
            </div>

            {/* Card 2 — nearby stock, real category-style numbers in the
                shape actually used on the homepage ("4 shops · 320 m"). */}
            {/* Explicit height, shorter and wider than card 1 — a clear
                second step in the stack's proportions, not incidental. */}
            <div
              className="glass-card rise-in flex h-44 w-full flex-col justify-between p-5"
              style={{ animationDelay: '160ms' }}
            >
              <div className="flex items-center justify-between">
                <p className="font-technical text-[11.2px] uppercase tracking-[0.12em] text-white/55">
                  Nearby stock
                </p>
                <Icon name="trend" size={16} className="text-white/60" />
              </div>
              <span className="inline-flex w-fit items-center rounded-full bg-pill-in px-2.5 py-1 font-technical text-[11.2px] font-semibold uppercase tracking-[0.04em] text-white">
                Verified sellers
              </span>
              <div className="flex items-end gap-1.5" aria-hidden>
                {[13, 21, 16, 26, 19, 29, 22].map((h, i) => (
                  <span key={i} className="w-2 rounded-full bg-white/30" style={{ height: h }} />
                ))}
              </div>
              <p className="text-xs text-white/70">4 shops · 320 m away</p>
            </div>

            {/* Card 3 — the one real claim on the page: escrow is a shipped
                feature (PRODUCT.md), not a roadmap promise. */}
            {/* Explicit height again, and shorter still relative to its
                width than card 2 — the most rectangular card in the stack,
                landscape rather than square. */}
            <div
              className="glass-card-light rise-in flex h-24 w-full items-center gap-3 p-4"
              style={{ animationDelay: '240ms' }}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success-ink">
                <Icon name="shield" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-technical text-[11.2px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Secure payment
                </p>
                <p className="mt-0.5 text-xs leading-snug text-ink">
                  Your money stays in escrow until delivery is confirmed.
                </p>
              </div>
              <Link
                href="/about"
                className="shrink-0 text-xs font-semibold text-accent-strong hover:underline"
              >
                How
              </Link>
            </div>
          </div>

          <div className="hidden shrink-0 flex-col items-end gap-4 lg:flex" aria-hidden>
            {CATEGORY_RAIL.map((c, i) => (
              <span
                key={c}
                className={`text-xs font-medium uppercase tracking-[0.14em] ${
                  i === 0 ? 'text-white' : 'text-white/45'
                }`}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Every visitor without a session is routed through this page first
          (see middleware.ts) — it's a mandatory gate, not optional
          marketing, so it owes a first-timer more than one hero viewport
          and an escrow claim. Three steps, real icons, no new claims: this
          is the same loop the storefront itself runs, just named out loud
          before someone's asked to commit to an account. */}
      <section className="bg-page px-5 py-14 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-heading text-ink">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: 'search' as const,
                title: 'Search nearby',
                body: 'Look up what you need — results are live stock a verified seller physically has right now, not a catalogue.',
              },
              {
                icon: 'scale' as const,
                title: 'Compare and choose',
                body: 'See price, distance, and delivery time side by side across every shop that actually has it in stock.',
              },
              {
                icon: 'scooter' as const,
                title: 'Pay and get it delivered',
                body: 'Your money sits in escrow until delivery is confirmed, so neither side has to trust the other first.',
              },
            ].map((step) => (
              <div key={step.title} className="text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent-strong">
                  <Icon name={step.icon} size={22} />
                </span>
                <p className="mt-3 font-semibold text-ink">{step.title}</p>
                <p className="mt-1.5 text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
