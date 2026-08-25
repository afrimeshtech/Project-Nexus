/**
 * Applies src/db/schema.sql to the configured database.
 *
 *   npm run db:push    - create the schema (refuses to run over existing data)
 *   npm run db:reset   - drop everything, recreate, then seed
 */
import { readFileSync } from 'node:fs'
import { getSql } from '../src/db/client.ts'
import {
  assertDestructiveAllowed,
  describeTarget,
  DestructiveGuardError,
} from '../src/lib/destructive-guard.ts'

const RESET = process.argv.includes('--reset')

async function main() {
  /*
   * Before the connection, not after.
   *
   * The guard was originally placed next to the DROP it protects, which read
   * well and did nothing: `getSql()` runs first, so pointing DATABASE_URL at
   * an unreachable production host failed on DNS and never reached the check.
   * Worse, against a host that *does* resolve, the script would connect and
   * query a live database before deciding whether it was allowed to.
   *
   * A refusal has to be reachable without touching the target at all.
   */
  if (RESET) assertDestructiveAllowed('drop and recreate the schema')

  console.log(`> target: ${describeTarget()}`)
  const sql = await getSql()

  const existing = await sql.one<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`,
  )

  if (existing?.exists && !RESET) {
    console.error('\n! Schema already present. Run `npm run db:reset` to drop and recreate it.')
    process.exit(1)
  }

  if (RESET) {
    // Already gated at the top of main(), before any connection was opened.
    console.log('> dropping schema public')
    await sql.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  }

  const ddl = readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8')
  console.log('> applying schema.sql')
  await sql.exec(ddl)

  const tables = await sql.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )
  console.log(`> ${tables.length} tables created:`)
  console.log('  ' + tables.map((t) => t.table_name).join(', '))
  process.exit(0)
}

main().catch((err) => {
  // A refusal is a decision, not a crash: print the reason on its own rather
  // than burying it in a stack trace the reader has to decode.
  if (err instanceof DestructiveGuardError) {
    console.error(`
! ${err.message}
`)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})
