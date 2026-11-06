import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle, so the container ships the built
  // application and only the modules it actually imports — no source tree and
  // no toolchain (CIM Volume III §6, containerisation).
  output: 'standalone',
  // PGlite ships a WASM build of PostgreSQL and `pg` uses node natives.
  // Neither may be bundled — they must be required at runtime on the server.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // The dev server only trusts requests whose Origin header matches one of
  // these by default — anything else (a phone on the LAN hitting the host's
  // network IP instead of localhost) gets its Server Actions silently
  // rejected. That's what broke the login page's Password tab: the tab
  // switch itself is a plain client re-render, but the OTP/password forms
  // are Server Actions, and enough of the page's own action-bound plumbing
  // sits behind this same origin check that the whole form read as inert.
  // Add a real device's LAN IP here when testing on one; it will need
  // updating if DHCP hands out a different address later.
  allowedDevOrigins: ['192.168.1.63', '192.168.43.153'],
  // The dev-tools badge floats in the bottom-left corner, which on a phone is
  // exactly where the bottom navigation's Home tab sits - it swallowed every
  // tap on Home in development. Every other corner covers the menu, the basket
  // or Profile instead, so it is switched off. Dev only: production builds
  // never render it, and build/runtime errors still show their overlay.
  devIndicators: false,
  // Baseline browser protections on every response (Security & Trust
  // Framework §B). Caddy set them only for /uploads, so pages went out bare.
  // Not a full Content-Security-Policy yet: one strict enough to matter has
  // to be proven against every page's scripts first, and a wrong one breaks
  // the site. frame-ancestors is the part of CSP that is safe to ship alone.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Browsers ignore this over plain http, so it is harmless in dev.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // No page may be framed: stops clickjacking a checkout or a payout.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Barcode scanning needs the camera and the location picker needs
          // geolocation - for this site only. Nothing uses the microphone.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=()',
          },
        ],
      },
    ]
  },
  experimental: {
    // The commerce, payment and inventory modules all run server-side only.
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
