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
 */
export function SectionHeading({
  title,
  subtitle,
  eyebrow,
  action,
}: {
  title: string
  subtitle?: string
  /** Short classifier — the tier, the module, the period being shown. */
  eyebrow?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 font-technical text-eyebrow uppercase text-accent-500">{eyebrow}</p>
        )}
        <h2 className="text-heading text-ink">{title}</h2>
        {subtitle && <p className="mt-1 max-w-[74ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-accent-ink hover:bg-accent-600 disabled:bg-accent-soft',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-muted',
  ghost: 'text-accent-500 hover:bg-accent-soft',
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
 * Dark green, unlike every other card in the app. A dashboard is read by
 * scanning for figures, and a grid of dark tiles on the light page makes that
 * one movement rather than eight separate reads. It also means the value can
 * be plain white — the strongest contrast available — without the card having
 * to compete with the content below it.
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
      <p className="flex items-center gap-1.5 font-technical text-[0.7rem] font-medium uppercase tracking-[0.12em] text-stat-label">
        <Icon name={icon ?? iconForStat(label)} size={13} />
        {label}
      </p>
      {/* Tabular figures so a column of numbers lines up, and tight tracking
          so a large figure does not read as loose at display size. */}
      <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums text-stat-value sm:text-[1.75rem]">
        {value}
      </p>
      {hint && (
        <p
          className={`mt-1 text-xs ${
            tone === 'danger'
              ? 'text-stat-danger'
              : tone === 'brand'
                ? 'text-accent-500'
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

export const inputClass =
  'w-full rounded-brand border border-line bg-field px-3 py-2.5 text-sm text-field-ink placeholder:text-field-muted focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30'

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
      className={`${dims} ${rounded} grid shrink-0 place-items-center bg-accent-soft font-semibold text-accent-500`}
    >
      {initials || '?'}
    </span>
  )
}

export function Divider() {
  return <hr className="border-line-soft" />
}
