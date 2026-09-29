'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSql } from '@/db/client'
import { hydrateCart, readCart, writeCart } from '@/lib/cart'
import { currentUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { sourcingContext } from '@/lib/viewer'
import { canTrade, TIER } from '@/lib/tiers'
import { placeOrder, payOrder, BusinessRuleError } from '@/modules/orders/service'
import { toggleFavouriteProduct, toggleFavouriteSeller } from '@/modules/favourites/service'

import { parseForm, z, uuid, quantity, fulfilment, paymentMethod, optionalText } from '@/lib/forms'

export interface CartActionState {
  error?: string
  notice?: string
}

const addToCartSchema = z.object({
  inventoryItemId: uuid('item'),
  qty: quantity('Quantity', 1).default(1),
  mode: z.enum(['consumer', 'sourcing']).catch('consumer'),
})

const updateQtySchema = z.object({
  inventoryItemId: uuid('item'),
  qty: quantity('Quantity', 0),
})

const checkoutSchema = z.object({
  fulfilment: fulfilment.catch('delivery'),
  method: paymentMethod.catch('wallet'),
  address: optionalText(300),
})

const payOrderSchema = z.object({
  orderId: uuid('order'),
  method: paymentMethod,
})

const favouriteProductSchema = z.object({ productId: uuid('product') })
const favouriteSellerSchema = z.object({ organisationId: uuid('business') })

/**
 * Add to basket.
 *
 * Two invariants are enforced here rather than at checkout, so the shopper
 * learns about a problem while they can still act on it:
 *   - one basket holds one seller, because one order settles with one seller;
 *   - the seller must sit exactly one tier above the buyer (PRD §12).
 */
export async function addToCartAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = parseForm(addToCartSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { inventoryItemId, qty, mode } = parsed.data

  let tier: number = TIER.consumer
  let buyerOrgId: string | null = null

  if (mode === 'sourcing') {
    const ctx = await sourcingContext()
    if (!ctx) return { error: 'You need a verified business account to source stock' }
    tier = ctx.tier
    buyerOrgId = ctx.orgId
  }

  const sql = await getSql()
  const item = await sql.one<{
    organisation_id: string
    seller_name: string
    seller_tier: number
    qty_available: number
    min_order_qty: number
    product_name: string
    price: number | null
  }>(
    `SELECT i.organisation_id, o.name AS seller_name, o.tier_level AS seller_tier,
            i.qty_available, i.min_order_qty, p.name AS product_name,
            COALESCE(i.promo_price, ${tier === TIER.consumer ? 'i.retail_price' : 'i.wholesale_price'}) AS price
       FROM inventory_items i
       JOIN organisations o ON o.id = i.organisation_id
       JOIN products p ON p.id = i.product_id
      WHERE i.id = $1 AND i.is_listed = TRUE`,
    [inventoryItemId],
  )
  if (!item) return { error: 'That item is no longer listed' }
  if (!canTrade(tier, item.seller_tier)) {
    return { error: 'You are not permitted to buy from this tier of the supply chain' }
  }
  if (item.price === null) return { error: 'That item is not priced for your account type' }

  const wanted = Math.max(qty, item.min_order_qty)
  if (wanted > item.qty_available) {
    return { error: `Only ${item.qty_available} left at ${item.seller_name}` }
  }

  const cart = await readCart()
  let notice: string

  if (cart.sellerOrgId && (cart.sellerOrgId !== item.organisation_id || cart.tier !== tier)) {
    await writeCart({
      sellerOrgId: item.organisation_id,
      items: [{ inventoryItemId, qty: wanted }],
      tier,
      buyerOrgId,
    })
    notice = `Started a new basket at ${item.seller_name}. Each order goes to one seller.`
  } else {
    const existing = cart.items.find((i) => i.inventoryItemId === inventoryItemId)
    if (existing) {
      const total = existing.qty + wanted
      if (total > item.qty_available) return { error: `Only ${item.qty_available} left in stock` }
      existing.qty = total
    } else {
      cart.items.push({ inventoryItemId, qty: wanted })
    }
    await writeCart({
      sellerOrgId: item.organisation_id,
      items: cart.items,
      tier,
      buyerOrgId,
    })
    notice = `${item.product_name} added to your basket`
  }

  revalidatePath('/', 'layout')
  return { notice }
}

export async function updateCartQtyAction(formData: FormData) {
  const parsed = parseForm(updateQtySchema, formData)
  if (!parsed.ok) return
  const { inventoryItemId, qty } = parsed.data
  const cart = await readCart()

  const items =
    qty <= 0
      ? cart.items.filter((i) => i.inventoryItemId !== inventoryItemId)
      : cart.items.map((i) => (i.inventoryItemId === inventoryItemId ? { ...i, qty } : i))

  await writeCart({ ...cart, sellerOrgId: items.length ? cart.sellerOrgId : null, items })
  revalidatePath('/cart')
  revalidatePath('/partner/source')
  revalidatePath('/', 'layout')
}

export async function clearCartAction() {
  await writeCart({ sellerOrgId: null, items: [], tier: TIER.consumer, buyerOrgId: null })
  revalidatePath('/cart')
  revalidatePath('/', 'layout')
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function checkoutAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/cart')

  const parsed = parseForm(checkoutSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { fulfilment, method, address } = parsed.data

  const cart = await hydrateCart()
  if (!cart.seller || !cart.lines.length) return { error: 'Your basket is empty' }
  if (cart.hasIssues) return { error: 'Some items exceed what the seller has in stock' }

  // A consumer's goods go to where they are standing; a business's restock
  // goes to the business's own premises.
  let deliverTo: { lat: number; lng: number; label: string }
  if (cart.tier === TIER.consumer) {
    const location = await buyerLocation()
    deliverTo = { lat: location.lat, lng: location.lng, label: location.label }
  } else {
    const ctx = await sourcingContext()
    if (!ctx || ctx.orgId !== cart.buyerOrgId) {
      return { error: 'Your business account no longer matches this basket' }
    }
    deliverTo = { lat: ctx.lat, lng: ctx.lng, label: ctx.address ?? ctx.orgName }
  }

  let orderId: string
  try {
    const order = await placeOrder({
      buyerUserId: user.id,
      buyerOrgId: cart.buyerOrgId,
      buyerTier: cart.tier,
      sellerOrgId: cart.seller.id,
      items: cart.lines.map((l) => ({ inventoryItemId: l.inventory_item_id, qty: l.qty })),
      fulfilment,
      deliveryAddress: address || deliverTo.label,
      deliveryLat: deliverTo.lat,
      deliveryLng: deliverTo.lng,
    })
    orderId = order.id
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[checkout] failed to place order', err)
    return { error: 'We could not place that order. Please try again.' }
  }

  const payment = await payOrder(orderId, user.id, method)

  // The basket is cleared either way: the order now exists, and an unpaid
  // order is recoverable from the order page rather than from a stale cookie.
  await writeCart({ sellerOrgId: null, items: [], tier: TIER.consumer, buyerOrgId: null })
  revalidatePath('/', 'layout')

  if (!payment.ok) {
    redirect(`/orders/${orderId}?payment=failed&reason=${encodeURIComponent(payment.error ?? '')}`)
  }
  // An external provider has not taken the money yet — it has told us where to
  // send the customer to do that. The order stays in pending_payment until its
  // webhook says otherwise.
  if (payment.actionRequired?.kind === 'redirect') {
    redirect(payment.actionRequired.value)
  }
  redirect(`/orders/${orderId}?payment=success`)
}

/** Retry payment on an order that was placed but not settled. */
export async function payOrderAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(payOrderSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  const result = await payOrder(parsed.data.orderId, user.id, parsed.data.method)
  if (!result.ok) return { error: result.error }

  if (result.actionRequired?.kind === 'redirect') {
    redirect(result.actionRequired.value)
  }

  revalidatePath(`/orders/${parsed.data.orderId}`)
  if (result.awaitingProvider) {
    return { notice: 'Waiting for the payment provider to confirm your payment.' }
  }
  return { notice: 'Payment successful' }
}

// ---------------------------------------------------------------------------

export async function toggleFavouriteProductAction(formData: FormData) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(favouriteProductSchema, formData)
  if (!parsed.ok) return

  await toggleFavouriteProduct(user.id, parsed.data.productId)
  revalidatePath('/favourites')
  revalidatePath('/', 'layout')
}

export async function toggleFavouriteSellerAction(formData: FormData) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(favouriteSellerSchema, formData)
  if (!parsed.ok) return

  await toggleFavouriteSeller(user.id, parsed.data.organisationId)
  revalidatePath('/favourites')
  revalidatePath('/', 'layout')
}
