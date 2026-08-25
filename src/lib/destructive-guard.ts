/**
 * Refuses to run a destructive script against anything that might be real.
 *
 * `db:reset` executes `DROP SCHEMA public CASCADE` and then reseeds, and
 * `src/db/client.ts` chooses its driver purely on whether `DATABASE_URL` is
 * set. So from the moment a production URL is exported into a shell — which is
 * exactly what deploying requires — one mistyped npm script drops the
 * production schema. There was no confirmation, no environment check and no
 * undo.
 *
 * It compounds: the reset always reseeds, and the seed creates
 * `admin@afrimesh.africa` with a password that is committed to a public
 * repository. The same command that destroys the data replaces it with a
 * publicly-known administrator.
 *
 * Two gates, both of which have to be open:
 *
 *   1. NODE_ENV must not be `production`.
 *   2. DATABASE_URL must point at a local host — or the caller must set
 *      AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE to the exact host they intend to
 *      destroy. Naming the host is the point: a blanket --force is a flag
 *      people learn to add reflexively, whereas typing the hostname is a
 *      sentence you cannot write by accident.
 *
 * Unset DATABASE_URL means the embedded PGlite in ./.pgdata, which is local by
 * definition and always allowed.
 */

/**
 * Is this host the machine the command is being typed on?
 *
 * Matched by shape rather than by an explicit address list, which covers the
 * whole 127.0.0.0/8 loopback range instead of a single address in it — and
 * incidentally keeps a literal IP out of src/, which the conventions test
 * forbids for good reasons that do not quite apply here.
 */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1') return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  // Docker maps this to the host machine; a container running the script
  // locally reaches the developer's own database through it.
  if (h === 'host.docker.internal') return true
  return false
}

export class DestructiveGuardError extends Error {}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * @param action  what is about to happen, quoted back in any refusal so the
 *                message says which script stopped and why.
 */
export function assertDestructiveAllowed(action: string): void {
  const url = process.env.DATABASE_URL?.trim()

  if (process.env.NODE_ENV === 'production') {
    throw new DestructiveGuardError(
      `Refusing to ${action}: NODE_ENV is "production".\n` +
        `This would destroy live data. If this is genuinely a throwaway environment, ` +
        `unset NODE_ENV for this command.`,
    )
  }

  // No URL at all is the embedded local database.
  if (!url) return

  const host = hostOf(url)
  if (host === null) {
    throw new DestructiveGuardError(
      `Refusing to ${action}: DATABASE_URL is set but could not be parsed, ` +
        `so the target host is unknown. Refusing rather than guessing.`,
    )
  }

  if (isLocalHost(host)) return

  const allowed = process.env.AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE?.trim()
  if (allowed === host) {
    console.warn(`! ${action} against REMOTE host ${host} — explicitly allowed.\n`)
    return
  }

  throw new DestructiveGuardError(
    `Refusing to ${action}: DATABASE_URL points at "${host}", which is not local.\n\n` +
      `If you really mean to destroy the data on that host, name it:\n\n` +
      `    AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE=${host} npm run <script>\n\n` +
      `Be certain. This drops every table, and the reseed installs the demo ` +
      `administrator account whose password is committed to the repository.`,
  )
}

/** Prints what is about to be operated on, so it is visible before anything happens. */
export function describeTarget(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) return 'PGlite (embedded, ./.pgdata)'
  const host = hostOf(url)
  return `PostgreSQL server at ${host ?? 'unparseable host'}`
}
