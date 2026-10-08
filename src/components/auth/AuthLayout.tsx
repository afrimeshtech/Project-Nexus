import Link from 'next/link'
import { Wordmark } from '@/components/brand/Logo'
import { Card } from '@/components/ui'

export function AuthLayout({
  title,
  subtitle,
  children,
  footnote,
  bare = false,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footnote?: string
  /**
   * Opt-in alternate presentation: the tinted Page ground (never white — the
   * Tinted Ground Rule still applies) with the form sitting on it directly,
   * no dark Forest Ground backdrop, no Card wrapper. Every field, label,
   * error state and the footnote are identical to the default; only the
   * container changes. Off by default so it can be compared side-by-side on
   * a real screen before it replaces the card-on-dark version anywhere.
   */
  bare?: boolean
}) {
  if (bare) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/afrimesh-icon.png" alt="AfriMesh" className="mb-4 size-14 rounded-brand" />
        <div className="w-full max-w-sm">
          <h1 className="text-center text-display-sm">{title}</h1>
          <p className="mb-4 mt-1.5 text-center text-sm text-muted">{subtitle}</p>
          {children}
        </div>
        {footnote && (
          <p className="mt-6 max-w-sm text-center font-technical text-xs text-muted">{footnote}</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-bar flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6">
        <Wordmark size="md" orientation="stacked" priority />
      </Link>
      <Card className="w-full max-w-sm">
        <h1 className="text-xl">{title}</h1>
        <p className="mb-4 mt-1 text-sm text-muted">{subtitle}</p>
        {children}
      </Card>
      {footnote && (
        <p className="mt-6 max-w-sm text-center font-technical text-xs text-white/60">{footnote}</p>
      )}
    </div>
  )
}
