'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSql } from '@/db/client'
import { currentUser, currentOrganisation } from '@/lib/auth'
import { toMinor } from '@/lib/money'
import { addBatch, setStockLevel, updatePricing, upsertStock } from '@/modules/inventory/service'

import { parseForm, z, uuid, quantity, nairaAmount, requiredText } from '@/lib/forms'

export interface InventoryActionState {
  error?: string
  notice?: string
}

const listingSchema = z.object({
  productId: uuid('product'),
  qty: quantity('Quantity', 0),
  price: nairaAmount('Price', 1),
  minOrderQty: quantity('Minimum order', 1).default(1),
  reorderLevel: quantity('Reorder level', 0).default(5),
})

const adjustSchema = z.object({
  itemId: uuid('item'),
  qty: quantity('Counted quantity', 0),
  note: requiredText('A reason', 200).catch('Stock count adjustment'),
})

const pricingSchema = z
  .object({
    itemId: uuid('item'),
    price: nairaAmount('Price', 1),
    promoPrice: z.coerce
      .number()
      .min(0)
      .optional()
      .or(z.literal('').transform(() => 0)),
    minOrderQty: quantity('Minimum order', 1).default(1),
    isListed: z.literal('on').optional(),
  })
  .refine((value) => !value.promoPrice || value.promoPrice < value.price, {
    message: 'A promotional price must be below the normal price.',
  })

const batchSchema = z.object({
  itemId: uuid('item'),
  batchNumber: requiredText('Batch number', 60),
  manufacturedOn: z.string().trim().optional(),
  expiresOn: z.string().trim().optional(),
  qty: quantity('Quantity', 0).default(0),
})

/**
 * Every action here re-resolves the caller's organisation and scopes the write
 * to it. A server action is a public HTTP endpoint - the organisation id is
 * never taken from the form, or one seller could edit another's stock.
 */
async function requireOwnedOrg() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/inventory')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')
  return { user, org }
}

async function assertOwnsItem(itemId: string, orgId: string) {
  const sql = await getSql()
  const row = await sql.one<{ organisation_id: string }>(
    `SELECT organisation_id FROM inventory_items WHERE id = $1`,
    [itemId],
  )
  return row?.organisation_id === orgId
}

/** List a catalogue product, or add stock to an existing listing. */
export async function addListingAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user, org } = await requireOwnedOrg()

  const parsed = parseForm(listingSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { productId, qty, price, minOrderQty, reorderLevel } = parsed.data

  // Outlets sell to consumers at retail; every other tier supplies businesses
  // at wholesale. The tier decides which column the price lands in, so a
  // seller only ever sees one price field.
  const isRetail = org.type === 'outlet'

  try {
    await upsertStock({
      organisationId: org.id,
      productId,
      qty,
      retailPrice: isRetail ? toMinor(price) : null,
      wholesalePrice: isRetail ? null : toMinor(price),
      minOrderQty: Math.max(1, minOrderQty),
      reorderLevel: Math.max(0, reorderLevel),
      actorUserId: user.id,
      note: 'Listed from dashboard',
    })
  } catch (err) {
    console.error('[inventory] listing failed', err)
    return { error: 'We could not save that listing.' }
  }

  revalidatePath('/partner/inventory')
  revalidatePath('/partner/catalogue')
  return { notice: 'Listing saved and live.' }
}

/** Stock-take correction. Writes an `adjustment` row to the immutable ledger. */
export async function adjustStockAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user, org } = await requireOwnedOrg()
  const parsed = parseForm(adjustSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { itemId, qty, note } = parsed.data

  if (!(await assertOwnsItem(itemId, org.id))) return { error: 'That item is not yours' }

  try {
    await setStockLevel(itemId, qty, user.id, note)
  } catch (err) {
    console.error('[inventory] adjustment failed', err)
    return { error: 'We could not adjust that stock level.' }
  }

  revalidatePath('/partner/inventory')
  revalidatePath(`/partner/inventory/${itemId}`)
  return { notice: 'Stock level updated and recorded in the ledger.' }
}

export async function updatePricingAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { org, user } = await requireOwnedOrg()
  const parsed = parseForm(pricingSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  const { itemId, price, minOrderQty } = parsed.data
  const promo = Number(parsed.data.promoPrice ?? 0)
  const isListed = parsed.data.isListed === 'on'

  if (!(await assertOwnsItem(itemId, org.id))) return { error: 'That item is not yours' }

  const isRetail = org.type === 'outlet'

  await updatePricing(itemId, {
    retailPrice: isRetail ? toMinor(price) : null,
    wholesalePrice: isRetail ? null : toMinor(price),
    promoPrice: promo ? toMinor(promo) : null,
    minOrderQty: Math.max(1, minOrderQty),
    isListed,
  }, user.id)

  revalidatePath('/partner/inventory')
  revalidatePath(`/partner/inventory/${itemId}`)
  return { notice: 'Pricing updated.' }
}

export async function addBatchAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { org } = await requireOwnedOrg()
  const parsed = parseForm(batchSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { itemId, batchNumber, manufacturedOn, expiresOn, qty } = parsed.data

  if (!(await assertOwnsItem(itemId, org.id))) return { error: 'That item is not yours' }

  await addBatch(itemId, {
    batchNumber,
    manufacturedOn: manufacturedOn || null,
    expiresOn: expiresOn || null,
    qty,
  })

  revalidatePath(`/partner/inventory/${itemId}`)
  return { notice: 'Batch recorded.' }
}
