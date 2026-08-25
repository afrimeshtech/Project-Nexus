import type { Metadata, Viewport } from 'next'
import { Inter, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

/**
 * Typography, per the Brand Identity Guide:
 *   Primary   Inter          - UI, dashboards, websites, applications
 *   Secondary IBM Plex Sans  - technical and developer-facing materials
 *   Fallback  Arial          - declared in the token in globals.css
 *
 * Both faces load `latin-ext` as well as `latin`, and that is not optional
 * here: the naira sign is U+20A6, and Google's `latin` subset stops at the
 * euro (U+20AC is included; the U+20A0-20AB block that contains ₦ is not).
 * Without `latin-ext` the browser has to substitute a system font for the
 * currency symbol alone — and the substitute's crossbars overhang their
 * advance width, so on a dashboard figure like ₦42,642.96 the symbol strikes
 * through the first digits and the number reads as struck out.
 *
 * A platform that prices everything in naira cannot subset the naira away.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

const plex = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'AfriMesh — Where Commerce Connects',
    template: '%s · AfriMesh',
  },
  description:
    "Africa's proximity commerce and payment infrastructure. Find what you need from trusted sellers nearby, pay securely, and get it delivered.",
  applicationName: 'AfriMesh Commerce',
}

export const viewport: Viewport = {
  // The colour a mobile browser tints its own chrome with, so it should be
  // the app's bar rather than its text: those were the same value until the
  // bars were greened, and this was left pointing at the old ink.
  themeColor: '#123824',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  )
}
