/**
 * Replaces the seeded demo password on every account that still has it.
 *
 *   DEMO_PASSWORD='a-long-new-password' npm run db:demo-passwords
 *
 * The seed gives every demo account - the super admin included - the password
 * `afrimesh`, which is committed to this repository. That is fine on a laptop
 * and a full compromise on a public server, so a deployment that loads the
 * demo data runs this straight after the seed.
 *
 * Only accounts whose password still verifies as the seeded one are changed:
 * anyone who has already set their own password keeps it, and running this a
 * second time changes nothing. The new password is read from the environment
 * rather than the command line so it does not land in shell history.
 */
import { getSql } from '../src/db/client.ts'
import { hashPassword, verifyPassword } from '../src/modules/identity/service.ts'

const SEEDED_PASSWORD = 'afrimesh'

async function main() {
  const next = process.env.DEMO_PASSWORD ?? ''
  if (next.length < 12) {
    console.error('! Set DEMO_PASSWORD to the new password, at least 12 characters.')
    process.exit(1)
  }
  if (next === SEEDED_PASSWORD) {
    console.error('! DEMO_PASSWORD is the seeded password. Choose a different one.')
    process.exit(1)
  }

  const sql = await getSql()
  const users = await sql.query<{ id: string; email: string | null; password_hash: string }>(
    `SELECT id, email, password_hash FROM users WHERE password_hash IS NOT NULL`,
  )

  const hash = await hashPassword(next)
  let changed = 0
  for (const user of users) {
    if (!(await verifyPassword(SEEDED_PASSWORD, user.password_hash))) continue
    await sql.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, hash])
    // Signed-in sessions made with the old password end with it.
    await sql.query(`DELETE FROM sessions WHERE user_id = $1`, [user.id])
    changed += 1
    console.log(`  ${user.email ?? user.id}`)
  }

  console.log(
    `\n> ${changed} demo account${changed === 1 ? '' : 's'} moved off the seeded password.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
