/**
 * Sets a password on chosen accounts.
 *
 *   NEW_PASSWORD='...' npm run user:set-password -- admin@afrimesh.africa
 *   NEW_PASSWORD='...' npm run user:set-password -- --demo
 *
 * `--demo` is the non-administrator accounts the seed creates, by email, which
 * is how they get an easy-to-type password for a pitch while the console keeps
 * its own. It is an explicit list on purpose: an earlier "every account except
 * administrators" option also reset a real person who had just signed up.
 *
 * The password is read from the environment rather than the command line so it
 * does not land in shell history, and every session of a changed account ends.
 */
import { getSql } from '../src/db/client.ts'
import { hashPassword } from '../src/modules/identity/service.ts'

/** The non-administrator accounts scripts/seed.ts creates. */
const DEMO_EMAILS = [
  'ada@example.ng',
  'musa@example.ng',
  'chidinma@example.ng',
  'grace@gracestores.ng',
  'jide@jidesupermarket.ng',
  'adaobi@adaobistores.ng',
  'bola@yabaminimart.ng',
  'kemi@surulerefresh.ng',
  'chinedu@ikejapharmacy.ng',
  'ifeoma@lekkihome.ng',
  'yakubu@buildright.ng',
  'emeka@alabawholesale.ng',
  'fatima@mushintrade.ng',
  'segun@oshodibulk.ng',
  'tunde@apapahub.ng',
  'ngozi@ikejacentral.ng',
  'sola@rider.ng',
  'ibrahim@rider.ng',
  'peter@rider.ng',
]

async function main() {
  const next = process.env.NEW_PASSWORD ?? ''
  const args = process.argv.slice(2)
  if (next.length < 8) {
    console.error('! Set NEW_PASSWORD to the new password, at least 8 characters.')
    process.exit(1)
  }
  if (!args.length) {
    console.error('! Name the accounts by email, or pass --demo.')
    process.exit(1)
  }

  const sql = await getSql()
  const emails = args.includes('--demo')
    ? DEMO_EMAILS
    : args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase())
  const users = await sql.query<{ id: string; email: string | null; role: string }>(
    `SELECT id, email, role::text AS role FROM users WHERE lower(email) = ANY($1)`,
    [emails],
  )

  const found = new Set(users.map((u) => u.email?.toLowerCase()))
  for (const email of emails) {
    if (!found.has(email)) console.error(`  ! no account ${email}`)
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
