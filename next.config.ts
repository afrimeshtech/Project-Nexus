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
  allowedDevOrigins: ['192.168.1.63'],
  experimental: {
    // The commerce, payment and inventory modules all run server-side only.
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
