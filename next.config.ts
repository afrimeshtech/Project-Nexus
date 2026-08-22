import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle, so the container ships the built
  // application and only the modules it actually imports — no source tree and
  // no toolchain (CIM Volume III §6, containerisation).
  output: 'standalone',
  // PGlite ships a WASM build of PostgreSQL and `pg` uses node natives.
  // Neither may be bundled — they must be required at runtime on the server.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  experimental: {
    // The commerce, payment and inventory modules all run server-side only.
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
