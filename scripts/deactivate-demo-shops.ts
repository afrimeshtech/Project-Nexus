/**
 * Takes the seeded demo shops off a live marketplace, leaving only businesses
 * that registered for real.
 *
 *   npm run db:deactivate-demo            # dry run: prints what would change
 *   npm run db:deactivate-demo -- --apply # writes it, in one transaction
 *
 * Deactivated, not deleted. Each demo shop is suspended and its verification
 * rejected - discovery only ever shows active, verified sellers - and every
 * product it lists is unlisted. Their past orders, payments and wallet history
 * stay exactly as they were, so the ledger still balances and the change can
 * be undone by an admin re-approving a shop.
 *
 * Shops are found only through the seed's demo owner emails, so a business
 * someone actually registered is never touched. Running it twice changes
 * nothing the second time.
 */
import { getSql, withTx, type Sql } from '../src/db/client.ts'

/** The owner email of every shop `scripts/seed.ts` creates. */
const DEMO_SHOP_EMAILS = [
  'tunde@apapahub.ng',
  'ngozi@ikejacentral.ng',
  'emeka@alabawholesale.ng',
  'fatima@mushintrade.ng',
  'segun@oshodibulk.ng',
  'grace@gracestores.ng',
  'jide@jidesupermarket.ng',
  'adaobi@adaobistores.ng',
  'bola@yabaminimart.ng',
  'kemi@surulerefresh.ng',
  'chinedu@ikejapharmacy.ng',
  'ifeoma@lekkihome.ng',
  'yakubu@buildright.ng',
]

async function deactivate(sql: Sql, log: (line: string) => void) {
  let shops = 0
  let listings = 0
  for (const email of DEMO_SHOP_EMAILS) {
    // Owner and shop email must both match: a real business that happened to
    // reuse one of these addresses for its contact email is not a demo shop.
    const org = await sql.one<{ id: string; name: string; status: string; verification: string }>(
      `SELECT o.id, o.name, o.status::text AS status, o.verification::text AS verification
         FROM organisations o JOIN users u ON u.id = o.owner_user_id
        WHERE u.email = $1 AND o.email = $1`,
      [email],
    )
    if (!org) {
      log(`  - ${email}: no demo shop, skipped`)
      continue
    }
    await sql.query(
      `UPDATE organisations SET status = 'suspended', verification = 'rejected' WHERE id = $1`,
      [org.id],
    )
    const unlisted = await sql.query<{ id: string }>(
      `UPDATE inventory_items SET is_listed = FALSE, updated_at = now()
        WHERE organisation_id = $1 AND is_listed RETURNING id`,
      [org.id],
    )
    shops += 1
    listings += unlisted.length
    log(
      `  ${org.name}: ${org.status}/${org.verification} -> suspended/rejected, ` +
        `${unlisted.length} listing(s) unlisted`,
    )
  }
  return { shops, listings }
}

async function main() {
  const apply = process.argv.includes('--apply')
  await getSql()
  const lines: string[] = []

  // A dry run does the same work inside a transaction and rolls it back, so
  // what it prints is exactly what --apply would write.
  const ROLLBACK = new Error('dry run')
  let counts: Awaited<ReturnType<typeof deactivate>> | null = null
  try {
    await withTx(async (tx) => {
      counts = await deactivate(tx, (line) => lines.push(line))
      if (!apply) throw ROLLBACK
    })
  } catch (err) {
    if (err !== ROLLBACK) throw err
  }

  console.log(lines.join('\n'))
  const c = counts as Awaited<ReturnType<typeof deactivate>> | null
  console.log(
    `\n> ${apply ? 'Deactivated' : 'Would deactivate'} ${c?.shops ?? 0} demo shop(s), ` +
      `unlisting ${c?.listings ?? 0} listing(s).` +
      (apply ? '' : '\n  Dry run - nothing written. Re-run with --apply.'),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
