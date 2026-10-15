import 'server-only'
import { cookies } from 'next/headers'
import { getSql } from '@/db/client'
import { priceColumnFor, TIER } from '@/lib/tiers'

/**
 * The basket.
 *
 * Held in a cookie rather than a table: it is short-lived, pre-transactional
 * state, and keeping it out of the database means an anonymous shopper can
 * fill a basket before signing in. Stock is not held at this point - a
 * reservation is only taken when the order is actually placed, which is what
 * the inventory doc specifies ("When an order is placed: reserve stock
 * immediately"). Basket contents are therefore always re-priced and
 * re-checked against live stock before checkout.
 *
 * One basket = one seller, because one order = one seller, and the payment
 * settles with that seller alone. An item from a different shop is refused
 * until the shopper either checks out or confirms starting a new basket.
 */

export const CART_COOKIE = 'afrimesh_cart'

export interface CartState {
  sellerOrgId: string | null
  items: { inventoryItemId: string; qty: number }[]
  /**
   * The tier the basket is being filled *as*. A shop owner browsing the
   * consumer storefront shops at tier 5 and pays retail; the same person in
   * their dashboard's "Source stock" flow shops at tier 4 and pays wholesale.
   * Recording it at add-time keeps pricing consistent all the way to checkout.
   */
  tier: number
  /** The buying organisation, for every B2B basket. */
  buyerOrgId: string | null
}

const EMPTY: CartState = { sellerOrgId: null, items: [], tier: TIER.consumer, buyerOrgId: null }

export async function readCart(): Promise<CartState> {
  const jar = await cookies()
  const raw = jar.get(CART_COOKIE)?.value
  if (!raw) return EMPTY
  try {
    const parsed = JSON.parse(raw) as CartState
    if (!Array.isArray(parsed.items)) return EMPTY
    return { ...parsed, tier: parsed.tier ?? TIER.consumer, buyerOrgId: parsed.buyerOrgId ?? null }
  } catch {
    return EMPTY
  }
}

export async function writeCart(cart: CartState): Promise<void> {
  const jar = await cookies()
  if (!cart.items.length) {
    jar.delete(CART_COOKIE)
    return
  }
  jar.set(CART_COOKIE, JSON.stringify(cart), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export interface CartLine {
  inventory_item_id: string
  product_id: string
  name: string
  image_url: string | null
  unit_price: number
  qty: number
  line_total: number
  qty_available: number
  min_order_qty: number
  unit_of_measure: string
  pack_size: string | null
  /** True when the shopper wants more than the seller currently has. */
  over_stock: boolean
}

export interface HydratedCart {
  seller: {
    id: string
    name: string
    slug: string
    type: string
    address: string | null
    lat: number
    lng: number
    avg_dispatch_minutes: number
  } | null
  lines: CartLine[]
  subtotal: number
  itemCount: number
  hasIssues: boolean
  tier: number
  buyerOrgId: string | null
}

const EMPTY_HYDRATED: HydratedCart = {
  seller: null,
  lines: [],
  subtotal: 0,
  itemCount: 0,
  hasIssues: false,
  tier: TIER.consumer,
  buyerOrgId: null,
}

/**
 * Re-read the basket against live inventory and current prices. Never trust
 * the cookie for money - the cookie holds ids, quantities and the buying tier
 * only; every price is re-fetched from the seller's live listing.
 */
export async function hydrateCart(): Promise<HydratedCart> {
  const cart = await readCart()
  if (!cart.items.length || !cart.sellerOrgId) return EMPTY_HYDRATED

  const sql = await getSql()
  const priceCol = priceColumnFor(cart.tier)
  const ids = cart.items.map((i) => i.inventoryItemId)

  const rows = await sql.query<{
    inventory_item_id: string
    product_id: string
    name: string
    image_url: string | null
    unit_price: number | null
    qty_available: number
    min_order_qty: number
    unit_of_measure: string
    pack_size: string | null
  }>(
    `SELECT i.id AS inventory_item_id, i.product_id, p.name, p.image_url,
            COALESCE(i.promo_price, i.${priceCol}) AS unit_price,
            i.qty_available, i.min_order_qty, p.unit_of_measure, p.pack_size
       FROM inventory_items i
       JOIN products p ON p.id = i.product_id
      WHERE i.id = ANY($1::uuid[]) AND i.is_listed = TRUE`,
    [ids],
  )

  const byId = new Map(rows.map((r) => [r.inventory_item_id, r]))

  const lines: CartLine[] = []
  for (const item of cart.items) {
    const row = byId.get(item.inventoryItemId)
    if (!row || row.unit_price === null) continue // delisted since it was added
    lines.push({
      inventory_item_id: row.inventory_item_id,
      product_id: row.product_id,
      name: row.name,
      image_url: row.image_url,
      unit_price: row.unit_price,
      qty: item.qty,
      line_total: row.unit_price * item.qty,
      qty_available: row.qty_available,
      min_order_qty: row.min_order_qty,
      unit_of_measure: row.unit_of_measure,
      pack_size: row.pack_size,
      over_stock: item.qty > row.qty_available,
    })
  }

  const seller = await sql.one<HydratedCart['seller']>(
    `SELECT id, name, slug, type::text AS type, address, lat, lng, avg_dispatch_minutes
       FROM organisations WHERE id = $1`,
    [cart.sellerOrgId],
  )

  return {
    seller,
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.line_total, 0),
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    hasIssues: lines.some((l) => l.over_stock),
    tier: cart.tier,
    buyerOrgId: cart.buyerOrgId,
  }
}

export async function cartCount(): Promise<number> {
  const cart = await readCart()
  return cart.items.reduce((sum, i) => sum + i.qty, 0)
}
