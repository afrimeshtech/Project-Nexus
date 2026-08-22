import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import type { ReactNode } from 'react'

/**
 * Shared interface primitives.
 *
 * UI Principles from the Brand Guide drive every default here: simple, fast,
 * accessible, readable, touch-friendly, and one primary action per screen -
 * which is why `Button` has exactly one `primary` variant and everything else
 * is visually quieter.
 */

// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return <Tag className={`card p-5 sm:p-7 ${className}`}>{children}</Tag>
}

/**
 * A section heading.
 *
 * Three registers rather than one: an optional eyebrow set in the technical
 * face, the title in Inter pulled in tight, and the subtitle as prose held to
 * a readable measure. The brand specifies both faces — using only the primary
 * one left every heading in the app sounding identical, which is most of why
 * the pages read as generated.
 *
 * The subtitle is capped at ~74 characters. A dashboard is wide, and a line of
 * explanatory prose running the full width of a 1280px screen is unreadable
 * however well it is set.
 *
 * `as` sets the heading level, which is a real decision and not styling: a
 * screen reader navigates by the heading outline, so a section nested inside
 * another section needs h3 even though it looks identical. The component used
 * to hard-code h2 at every one of its call sites, which produced a flat and
 * partly wrong outline on any page with more than one level. Level and size
 * are independent here — changing `as` does not change how it looks.
 */
export function SectionHeading({
  title,
  subtitle,
  eyebrow,
  action,
  as: Heading = 'h2',
}: {
  title: string
  subtitle?: string
  /** Short classifier — the tier, the module, the period being shown. */
  eyebrow?: string
  action?: ReactNode
  /** Heading level. Follow the page outline, not the visual weight. */
  as?: 'h2' | 'h3' | 'h4'
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 font-technical text-eyebrow uppercase text-accent-strong">{eyebrow}</p>
        )}
        <Heading className="text-heading text-ink">{title}</Heading>
        {subtitle && <p className="mt-1 max-w-[74ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------

export type Crumb = { label: string; href?: string }

/**
 * Where you are, above the page title.
 *
 * Its own component because three pages build a bespoke masthead — a person, a
 * business, a product — and those need the orientation without giving up the
 * layout that makes them worth having.
 *
 * The last crumb is the current page: rendered as text and marked
 * aria-current, never as a link to where you already are.
 */
export function Breadcrumb({ trail, className = '' }: { trail: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`mb-2 ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-line">
                  /
                </span>
              )}
              {crumb.href && !last ? (
                <Link href={crumb.href} className="hover:text-ink hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * The top of a page.
 *
 * Four registers, in the order they are read: where you are (breadcrumb), what
 * this is (title), what it does (subtitle), and what you can do to it
 * (actions). Every dashboard page in the app opened with a bare heading and no
 * orientation before this — on a sidebar app with eleven destinations, "where
 * am I" is a question the page should answer without being asked.
 *
 * The title is an h1. There is one per page and it names the page, which is
 * what an h1 is for; `SectionHeading` starts at h2 beneath it, so the outline
 * comes out right without any call site having to think about it.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string
  subtitle?: string
  /**
   * Trail from the section root. The last entry is the current page and is
   * rendered as plain text — a link to where you already are is noise.
   */
  breadcrumb?: Crumb[]
  actions?: ReactNode
}) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb trail={breadcrumb} />}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display-sm text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-[74ch] text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/**
 * The controls that act on the list below: search on the left, switches and
 * secondary actions on the right, and — where the collection has totals worth
 * stating — a summary line beneath both.
 *
 * A panel rather than a loose row, because it belongs to the list and not to
 * the page: scrolling should carry it away together with the thing it filters.
 */
export function Toolbar({
  children,
  meta,
  className = '',
}: {
  children?: ReactNode
  /** Label/value pairs summarising the collection. */
  meta?: { label: string; value: ReactNode }[]
  className?: string
}) {
  return (
    <div className={`card mb-5 p-3 sm:p-4 ${className}`}>
      {children && (
        <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
      )}
      {meta && meta.length > 0 && (
        <dl
          className={`flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm ${
            children ? 'mt-3 border-t border-line-soft pt-3' : ''
          }`}
        >
          {meta.map((m) => (
            <div key={m.label} className="flex items-baseline gap-1.5">
              <dt className="font-technical text-eyebrow uppercase text-muted">{m.label}</dt>
              <dd className="font-semibold tabular-nums text-ink">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export type StockState = 'in' | 'low' | 'out'

const STOCK_PILL: Record<StockState, { className: string; label: string }> = {
  in: { className: 'bg-pill-in', label: 'In stock' },
  low: { className: 'bg-pill-low', label: 'Low stock' },
  out: { className: 'bg-pill-out', label: 'Out of stock' },
}

/**
 * Stock state, derived in one place so every surface agrees.
 *
 * "Low" is a threshold, and a threshold stated once cannot drift between the
 * partner's inventory table and the buyer's product page.
 */
export function stockState(qty: number, lowAt = 5): StockState {
  if (qty <= 0) return 'out'
  return qty <= lowAt ? 'low' : 'in'
}

/** The solid chip laid over a product photo. */
export function StatusPill({ state, children }: { state: StockState; children?: ReactNode }) {
  const pill = STOCK_PILL[state]
  return <span className={`pill-status ${pill.className}`}>{children ?? pill.label}</span>
}

/**
 * A catalogue card.
 *
 * The anatomy is fixed so a grid of them scans the way a table does: photo
 * well with the stock chip, the identifier in the technical face, the name,
 * the label/value rows carrying the numbers, then one way in. Because every
 * card puts the same thing in the same place, the eye can compare down a
 * column instead of re-reading each card from the top.
 *
 * The photo and the name both link, and the footer repeats the target as the
 * visible affordance — it takes `tabIndex={-1}` so keyboard users get one stop
 * per card rather than three to the same place.
 */
export function ItemCard({
  name,
  href,
  image,
  media,
  identifier,
  state,
  rows,
  action = 'View details',
  footer,
}: {
  name: string
  href: string
  image?: string | null
  /**
   * Artwork for the well, where a plain image URL is not enough — the product
   * thumbnails fall back through brand logo and category illustration, and
   * that resolution belongs to the caller rather than here.
   */
  media?: ReactNode
  /** SKU, code, or whatever names this item in the operator's own system. */
  identifier?: string
  state?: StockState
  rows?: { label: string; value: ReactNode }[]
  action?: string
  footer?: ReactNode
}) {
  return (
    <article className="item-card group hover:item-card-hover">
      <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
        <span className="item-well">
          {media ??
            (image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <Icon name="box" size={40} className="text-line" />
            ))}
          {state && <StatusPill state={state} />}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        {identifier && (
          <p className="font-technical text-eyebrow uppercase text-muted">{identifier}</p>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold text-ink">
          <Link href={href} className="hover:underline">
            {name}
          </Link>
        </h3>

        {rows && rows.length > 0 && (
          <dl className="mt-2.5">
            {rows.map((row) => (
              <div key={row.label} className="kv-row">
                <dt className="text-muted">{row.label}</dt>
                <dd className="font-semibold tabular-nums text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {footer}
      </div>

      <Link href={href} className="item-action hover:item-action-hover" tabIndex={-1}>
        {action}
      </Link>
    </article>
  )
}

// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-accent-ink hover:bg-accent-600 disabled:bg-accent-soft',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-muted',
  ghost: 'text-accent-strong hover:bg-accent-soft',
  danger: 'bg-coral-strong text-white hover:opacity-90',
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-brand px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export function Button({
  children,
  variant = 'primary',
  className = '',
  full,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  full?: boolean
}) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_STYLES[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  children,
  href,
  variant = 'primary',
  className = '',
  full,
}: {
  children: ReactNode
  href: string
  variant?: ButtonVariant
  className?: string
  full?: boolean
}) {
  return (
    <Link
      href={href}
      className={`${BUTTON_BASE} ${BUTTON_STYLES[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'brand' | 'sand' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted',
  // A solid accent chip with the dark accent ink, not orange text on an orange
  // tint: with the vivid accent those two are within a shade of each other and
  // "Best match" all but vanishes. Filled, it reads at 6.1:1 and the badge is
  // the most prominent thing on the card, which is what a badge is for.
  brand: 'bg-accent-500 text-accent-ink',
  sand: 'bg-accent-500 text-accent-ink',
  // Distinct from the accent: "verified" and "call to action" are not the
  // same signal, and on an orange-accented theme they would otherwise merge.
  success: 'bg-success/20 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-coral/15 text-coral-ink',
  info: 'bg-info/40 text-info-ink',
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------

/**
 * The icon beside a metric's label.
 *
 * Resolved from the label rather than passed in at all ~40 call sites, in the
 * same spirit as the product and seller artwork: a dashboard that gains a
 * "Refunds" tile tomorrow gets a sensible icon without anyone maintaining a
 * table. `icon` on the component overrides it where the guess is wrong.
 * Order matters — the most specific term wins.
 */
const STAT_ICONS: [RegExp, IconName][] = [
  [/gmv|revenue|earned|value|price/i, 'chart'],
  [/wallet|balance|escrow|payout|cash/i, 'wallet'],
  [/order/i, 'receipt'],
  [/fulfil|rate|health|uptime/i, 'pulse'],
  [/deliver|trip|distance|rider|partner/i, 'scooter'],
  [/consumer|user|customer|member/i, 'user'],
  [/outlet|shop|store/i, 'store'],
  [/merchant|wholesal/i, 'box'],
  [/warehouse|depot/i, 'warehouse'],
  [/stock|inventory|product|item|sku/i, 'tag'],
  [/saved|favourite/i, 'star'],
  [/event|table|database|log/i, 'list'],
  [/job|open|progress|pending/i, 'clock'],
]

function iconForStat(label: string): IconName {
  for (const [pattern, name] of STAT_ICONS) {
    if (pattern.test(label)) return name
  }
  return 'chart'
}

/**
 * A metric card: a number, what it measures, and optionally what qualifies it.
 *
 * A dashboard is read by scanning for figures, so the figure gets the contrast
 * and everything around it gets out of the way: one flat ground, a hairline,
 * the label in the small technical register and the number large enough to be
 * the only thing on the tile competing for attention.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  /** Overrides the icon derived from the label. */
  icon?: IconName
}) {
  return (
    <div className="stat-card p-4 hover:stat-card-hover">
      {/* The eyebrow register, from the type scale rather than three arbitrary
          values that happen to land near it — the token exists precisely so
          stat labels, column headers and eyebrows stay in step. */}
      <p className="flex items-center gap-1.5 font-technical text-eyebrow uppercase text-stat-label">
        <Icon name={icon ?? iconForStat(label)} size={13} />
        {label}
      </p>
      {/* Tabular figures so a column of numbers lines up, and tight tracking
          so a large figure does not read as loose at display size. */}
      <p className="mt-2 text-stat tabular-nums text-stat-value">{value}</p>
      {hint && (
        <p
          className={`mt-1 text-xs ${
            tone === 'danger'
              ? 'text-stat-danger'
              : tone === 'brand'
                ? 'text-accent-strong'
                : 'text-stat-hint'
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  body,
  action,
  icon = 'folder',
}: {
  title: string
  body?: string
  action?: ReactNode
  icon?: IconName
}) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-brand border border-line-soft text-muted">
        <Icon name={icon} size={26} />
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>}
      </div>
      {action}
    </div>
  )
}

export function Alert({
  children,
  tone = 'danger',
}: {
  children: ReactNode
  tone?: 'danger' | 'success' | 'info' | 'warning'
}) {
  const styles = {
    danger: 'border-coral/40 bg-coral/15 text-coral-ink',
    success: 'border-success/40 bg-success/15 text-success-ink',
    info: 'border-info-ink/30 bg-info/40 text-info-ink',
    warning: 'border-warning/40 bg-warning/15 text-warning-ink',
  }[tone]
  return (
    <div role="status" className={`rounded-brand border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/* The focus border takes --color-focus-ring rather than the vivid accent: a
   focus indicator is held to 3:1 against what surrounds it, and #ff9500 on the
   field is 2.2:1 — a ring a keyboard user cannot find is not an indicator. */
export const inputClass =
  'w-full rounded-brand border border-line bg-field px-3 py-2.5 text-sm text-field-ink placeholder:text-field-muted focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/30'

/**
 * `inputClass` for a field that shares its box with a `field-icon`.
 *
 * The icon is absolutely positioned at 0.875rem, so the control has to make
 * room for it. Without this the placeholder starts at 0.75rem and renders
 * underneath the glyph — which is exactly what the sidebar search did.
 *
 * Written as a substitution rather than a second literal so the two cannot
 * drift apart, and as an explicit pl-* rather than an extra class at the call
 * site so it is not left to Tailwind's conflict resolution between px-3 and a
 * padding-left added afterwards.
 */
export const inputWithIconClass = inputClass.replace('px-3', 'pl-10 pr-3')

// ---------------------------------------------------------------------------

export function Rating({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(Number(value) * 2) / 2
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className="flex items-center gap-0.5 text-accent-400" aria-hidden>
        {[1, 2, 3, 4, 5].map((step) => (
          <Icon key={step} name={step <= rounded ? 'star-filled' : 'star'} size={12} />
        ))}
      </span>
      <span className="font-medium text-ink">{Number(value).toFixed(1)}</span>
      {count !== undefined && <span>({count})</span>}
    </span>
  )
}

/**
 * Renders the recommendation score and its per-factor breakdown. Showing the
 * reasoning is a brand requirement, not decoration: "Transparent pricing" and
 * "Trust by Design" mean a buyer should be able to see why a shop was ranked
 * first rather than take it on faith.
 */
export function ScoreBar({
  score,
  breakdown,
}: {
  score: number
  breakdown?: Record<string, number>
}) {
  const FACTOR_LABEL: Record<string, string> = {
    availability: 'In stock',
    distance: 'Nearby',
    price: 'Price',
    rating: 'Rating',
    delivery_time: 'Speed',
    trust: 'Trust',
    fulfilment: 'Reliability',
    purchase_history: 'You shop here',
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent-500"
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
        <span className="shrink-0 font-technical text-xs font-medium text-muted">
          {score.toFixed(0)}
        </span>
      </div>
      {breakdown && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {Object.entries(breakdown)
            .filter(([, v]) => v > 0.5)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([factor, v]) => (
              <span
                key={factor}
                className="rounded bg-surface-muted px-1.5 py-0.5 font-technical text-[10px] text-muted"
              >
                {FACTOR_LABEL[factor] ?? factor} +{v.toFixed(0)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Product/shop imagery placeholder. Avoids broken images without stock art. */
export function Thumb({
  src,
  alt,
  size = 'md',
  rounded = 'rounded-brand',
}: {
  src?: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg'
  rounded?: string
}) {
  const dims = { sm: 'h-10 w-10', md: 'h-14 w-14', lg: 'h-20 w-20' }[size]
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={`${dims} ${rounded} object-cover`} />
  }
  const initials = alt
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden
      className={`${dims} ${rounded} grid shrink-0 place-items-center bg-accent-soft font-semibold text-accent-strong`}
    >
      {initials || '?'}
    </span>
  )
}

export function Divider() {
  return <hr className="border-line-soft" />
}
