/**
 * Moves the demo market already in a database from Lagos to the MVP pilot
 * towns, to match what `scripts/seed.ts` now creates.
 *
 *   npm run db:relocate-demo            # dry run: prints what would change
 *   npm run db:relocate-demo -- --apply # writes it, in one transaction
 *
 * A live database cannot simply be reseeded - that wipes real sign-ups - so
 * this rewrites the demo rows in place. Every row is found through a demo
 * account's email, so a real user, their shop and their orders are never
 * touched. Logins (emails, phones, passwords) stay exactly as they were.
 *
 * Moves: the demo shops (position, address, and the Lagos-named ones get a
 * pilot-town name and slug), their listings, their owners' saved addresses,
 * the demo shoppers and riders, and the demo orders and delivery jobs between
 * them, so the dashboards do not show a Jalingo shop delivering to Lagos.
 * Running it twice changes nothing the second time.
 */
import { getSql, withTx, type Sql } from '../src/db/client.ts'
import { slugify } from '../src/modules/catalog/service.ts'
import { setSetting } from '../src/modules/platform/service.ts'
import { haversineKm } from '../src/lib/geo.ts'

interface Place {
  lat: number
  lng: number
  address: string
  city: string
  state: string
}

/** Demo shops by their (unchanged) owner email; `name` only where it changes. */
const SHOPS: Record<string, Place & { name?: string }> = {
  'tunde@apapahub.ng': {
    name: 'Jalingo Distribution Hub',
    lat: 8.87,
    lng: 11.34,
    address: 'Yola Road, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'ngozi@ikejacentral.ng': {
    name: 'Yola Central Warehouse',
    lat: 9.21,
    lng: 12.488,
    address: 'Numan Road, Yola',
    city: 'Yola',
    state: 'Adamawa',
  },
  'emeka@alabawholesale.ng': {
    name: 'Jimeta Wholesale Ltd',
    lat: 9.276,
    lng: 12.462,
    address: 'Jimeta Modern Market',
    city: 'Jimeta',
    state: 'Adamawa',
  },
  'fatima@mushintrade.ng': {
    name: 'Jalingo Trade Partners',
    lat: 8.887,
    lng: 11.352,
    address: 'Jalingo Main Market',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'segun@oshodibulk.ng': {
    name: 'Yola Bulk Traders',
    lat: 9.202,
    lng: 12.499,
    address: 'Yola Main Market',
    city: 'Yola',
    state: 'Adamawa',
  },
  'grace@gracestores.ng': {
    lat: 8.8925,
    lng: 11.3612,
    address: '14 Hammaruwa Way, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'jide@jidesupermarket.ng': {
    lat: 8.8962,
    lng: 11.3571,
    address: '7 Barde Way, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'adaobi@adaobistores.ng': {
    lat: 9.278,
    lng: 12.46,
    address: '22 Bank Road, Jimeta',
    city: 'Jimeta',
    state: 'Adamawa',
  },
  'bola@yabaminimart.ng': {
    name: 'Jalingo Mini Mart',
    lat: 8.901,
    lng: 11.365,
    address: '5 Hospital Road, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'kemi@surulerefresh.ng': {
    name: 'Yola Fresh Foods',
    lat: 9.204,
    lng: 12.496,
    address: '31 Main Market Road, Yola',
    city: 'Yola',
    state: 'Adamawa',
  },
  'chinedu@ikejapharmacy.ng': {
    name: 'Jalingo Pharmacy Plus',
    lat: 8.8905,
    lng: 11.358,
    address: '9 Main Market Road, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'ifeoma@lekkihome.ng': {
    name: 'Jimeta Home Essentials',
    lat: 9.283,
    lng: 12.455,
    address: 'Mubi Road, Jimeta',
    city: 'Jimeta',
    state: 'Adamawa',
  },
  'yakubu@buildright.ng': {
    lat: 8.879,
    lng: 11.37,
    address: 'Mile Six, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
}

/** Demo shoppers and riders by email. Riders have no street address. */
const PEOPLE: Record<string, Place> = {
  'ada@example.ng': {
    lat: 8.8937,
    lng: 11.3596,
    address: '12 Hammaruwa Way, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'musa@example.ng': {
    lat: 8.9005,
    lng: 11.366,
    address: '3 Hospital Road, Jalingo',
    city: 'Jalingo',
    state: 'Taraba',
  },
  'chidinma@example.ng': {
    lat: 9.205,
    lng: 12.494,
    address: '18 Galadima Road, Yola',
    city: 'Yola',
    state: 'Adamawa',
  },
  'sola@rider.ng': { lat: 8.893, lng: 11.359, address: '', city: 'Jalingo', state: 'Taraba' },
  'ibrahim@rider.ng': { lat: 8.9, lng: 11.3645, address: '', city: 'Jalingo', state: 'Taraba' },
  'peter@rider.ng': { lat: 9.2045, lng: 12.495, address: '', city: 'Yola', state: 'Adamawa' },
}

const round2 = (km: number) => Math.round(km * 100) / 100

async function relocate(sql: Sql, log: (line: string) => void) {
  const orgIds = new Map<string, Place>()

  for (const [email, place] of Object.entries(SHOPS)) {
    const org = await sql.one<{
      id: string
      name: string
      slug: string
      owner_user_id: string | null
    }>(
      `SELECT o.id, o.name, o.slug, o.owner_user_id
         FROM organisations o JOIN users u ON u.id = o.owner_user_id
        WHERE u.email = $1 AND o.email = $1`,
      [email],
    )
    if (!org) {
      log(`  - ${email}: no demo shop, skipped`)
      continue
    }
    const name = place.name ?? org.name
    let slug = name === org.name ? org.slug : slugify(name)
    if (slug !== org.slug) {
      const clash = await sql.one(`SELECT id FROM organisations WHERE slug = $1 AND id <> $2`, [
        slug,
        org.id,
      ])
      if (clash) slug = org.slug
    }
    await sql.query(
      `UPDATE organisations
          SET name = $2, slug = $3, lat = $4, lng = $5, address = $6, city = $7, state = $8
        WHERE id = $1`,
      [org.id, name, slug, place.lat, place.lng, place.address, place.city, place.state],
    )
    // Listings carry a copy of the shop's position for proximity ranking.
    await sql.query(`UPDATE inventory_items SET lat = $2, lng = $3 WHERE organisation_id = $1`, [
      org.id,
      place.lat,
      place.lng,
    ])
    await sql.query(
      `UPDATE users SET default_lat = $2, default_lng = $3, default_address = $4, city = $5, state = $6
        WHERE id = $1`,
      [org.owner_user_id, place.lat, place.lng, place.address, place.city, place.state],
    )
    orgIds.set(org.id, place)
    log(`  ${org.name}${name !== org.name ? ` -> ${name}` : ''}: ${place.address}`)
  }

  const userIds = new Map<string, Place>()
  for (const [email, place] of Object.entries(PEOPLE)) {
    const user = await sql.one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email])
    if (!user) continue
    await sql.query(
      `UPDATE users SET default_lat = $2, default_lng = $3, default_address = $4, city = $5, state = $6
        WHERE id = $1`,
      [user.id, place.lat, place.lng, place.address || null, place.city, place.state],
    )
    await sql.query(`UPDATE search_queries SET lat = $2, lng = $3 WHERE user_id = $1`, [
      user.id,
      place.lat,
      place.lng,
    ])
    userIds.set(user.id, place)
    log(`  ${email}: ${place.address || place.city}`)
  }

  // Orders strictly between demo accounts: a demo seller, and a demo shopper
  // (B2C) or demo shop (B2B) buying. A real user's order is left alone.
  const orders = await sql.query<{
    id: string
    buyer_user_id: string
    buyer_org_id: string | null
    seller_org_id: string
  }>(`SELECT id, buyer_user_id, buyer_org_id, seller_org_id FROM orders`)
  let movedOrders = 0
  for (const order of orders) {
    const seller = orgIds.get(order.seller_org_id)
    const dropoff = order.buyer_org_id
      ? orgIds.get(order.buyer_org_id)
      : userIds.get(order.buyer_user_id)
    if (!seller || !dropoff) continue
    const km = round2(haversineKm(seller, dropoff))
    await sql.query(
      `UPDATE orders SET delivery_lat = $2, delivery_lng = $3, delivery_address = $4, distance_km = $5
        WHERE id = $1`,
      [order.id, dropoff.lat, dropoff.lng, dropoff.address, km],
    )
    await sql.query(
      `UPDATE deliveries
          SET pickup_lat = $2, pickup_lng = $3, dropoff_lat = $4, dropoff_lng = $5, distance_km = $6
        WHERE order_id = $1`,
      [order.id, seller.lat, seller.lng, dropoff.lat, dropoff.lng, km],
    )
    movedOrders += 1
  }
  log(`  ${movedOrders} demo order(s) and their delivery jobs`)

  await sql.query(
    `UPDATE ratings SET comment = 'Cheapest around here.' WHERE comment = 'Cheapest around Yaba.'`,
  )
  return { shops: orgIds.size, people: userIds.size, orders: movedOrders }
}

async function main() {
  const apply = process.argv.includes('--apply')
  await getSql()
  const lines: string[] = []
  const log = (line: string) => lines.push(line)

  // A dry run does the same work inside a transaction and then rolls it back,
  // so what it prints is exactly what --apply would write.
  const ROLLBACK = new Error('dry run')
  let counts: Awaited<ReturnType<typeof relocate>> | null = null
  try {
    await withTx(async (tx) => {
      counts = await relocate(tx, log)
      if (!apply) throw ROLLBACK
    })
  } catch (err) {
    if (err !== ROLLBACK) throw err
  }
  if (apply) await setSetting('launch_market', { city: 'Jalingo', country: 'NG' })

  console.log(lines.join('\n'))
  const c = counts as Awaited<ReturnType<typeof relocate>> | null
  console.log(
    `\n> ${apply ? 'Moved' : 'Would move'} ${c?.shops ?? 0} shops, ${c?.people ?? 0} shoppers/riders, ` +
      `${c?.orders ?? 0} orders to the pilot towns.` +
      (apply ? '' : '\n  Dry run - nothing written. Re-run with --apply.'),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
