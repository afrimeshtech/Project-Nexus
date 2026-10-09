/**
 * Sets a password on chosen accounts.
 *
 *   NEW_PASSWORD='...' npm run user:set-password -- admin@afrimesh.africa
 *   NEW_PASSWORD='...' npm run user:set-password -- --non-admins
 *
 * `--non-admins` is every account except the platform administrators and
 * auditors, which is how the demo accounts get an easy-to-type password for a
 * pitch while the console keeps its own.
 *
 * The password is read from the environment rather than the command line so it
 * does not land in shell history, and every session of a changed account ends.
 */
import { getSql } from '../src/db/client.ts'
import { hashPassword } from '../src/modules/identity/service.ts'

const ADMIN_ROLES = ['super_admin', 'platform_admin', 'auditor']

async function main() {
  const next = process.env.NEW_PASSWORD ?? ''
  const args = process.argv.slice(2)
  if (next.length < 8) {
    console.error('! Set NEW_PASSWORD to the new password, at least 8 characters.')
    process.exit(1)
  }
  if (!args.length) {
    console.error('! Name the accounts by email, or pass --non-admins.')
    process.exit(1)
  }

  const sql = await getSql()
  const users = args.includes('--non-admins')
    ? await sql.query<{ id: string; email: string | null; role: string }>(
        `SELECT id, email, role::text AS role FROM users WHERE NOT (role::text = ANY($1))`,
        [ADMIN_ROLES],
      )
    : await sql.query<{ id: string; email: string | null; role: string }>(
        `SELECT id, email, role::text AS role FROM users WHERE lower(email) = ANY($1)`,
        [args.map((a) => a.toLowerCase())],
      )

  const found = new Set(users.map((u) => u.email?.toLowerCase()))
  for (const arg of args) {
    if (!arg.startsWith('--') && !found.has(arg.toLowerCase()))
      console.error(`  ! no account ${arg}`)
  }

  const hash = await hashPassword(next)
  for (const user of users) {
    await sql.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, hash])
    await sql.query(`DELETE FROM sessions WHERE user_id = $1`, [user.id])
    console.log(`  ${user.email ?? user.id} (${user.role})`)
  }
  console.log(`\n> password set on ${users.length} account${users.length === 1 ? '' : 's'}.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
