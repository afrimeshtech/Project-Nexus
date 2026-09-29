'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSql } from '@/db/client'
import { currentUser, currentOrganisation, organisationFor, ADMIN_ROLES } from '@/lib/auth'
import { parseForm, z, uuid } from '@/lib/forms'
import {
  storeImage,
  removeStoredUrl,
  UploadError,
  MAX_IMAGE_BYTES,
} from '@/modules/storage/service'
import { publish, EVENT } from '@/modules/events/service'

export interface MediaActionState {
  error?: string
  notice?: string
}

const productSchema = z.object({ productId: uuid('product') })

function handle(err: unknown): MediaActionState {
  if (err instanceof UploadError) return { error: err.message }
  console.error('[media] upload failed', err)
  return { error: 'We could not save that image. Please try again.' }
}

/**
 * Attach a photo to a catalogue product.
 *
 * The catalogue is shared across every seller, so an image change is visible
 * to all of them. The rule that follows from that:
 *
 *   - any verified seller who lists the product may add a photo where there is
 *     none, because a missing photo hurts everyone selling it;
 *   - nobody may overwrite an existing one, or the last seller to upload wins
 *     and a competitor can deface your listing;
 *   - platform admins may always replace, which is the moderation path.
 */
export async function uploadProductImageAction(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/catalogue')

  const parsed = parseForm(productSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { productId } = parsed.data

  const file = formData.get('image')
  if (!(file instanceof File)) return { error: 'Choose an image to upload.' }

  const sql = await getSql()
  const product = await sql.one<{ id: string; name: string; image_url: string | null }>(
    `SELECT id, name, image_url FROM products WHERE id = $1`,
    [productId],
  )
  if (!product) return { error: 'That product is no longer in the catalogue.' }

  const isAdmin = ADMIN_ROLES.includes(user.role)

  if (!isAdmin) {
    const org = await currentOrganisation()
    if (!org) return { error: 'You need a business account to add product photos.' }
    if (org.verification !== 'verified') {
      return { error: 'Your business must be verified before you can add product photos.' }
    }

    const listing = await sql.one<{ id: string }>(
      `SELECT id FROM inventory_items WHERE organisation_id = $1 AND product_id = $2`,
      [org.id, productId],
    )
    if (!listing) return { error: 'Add this product to your inventory before adding a photo.' }

    if (product.image_url) {
      return {
        error: 'This product already has a photo. Contact support if it is wrong or misleading.',
      }
    }
  }

  try {
    const stored = await storeImage(file, 'products')
    const previous = product.image_url

    await sql.query(`UPDATE products SET image_url = $2 WHERE id = $1`, [productId, stored.url])
    // Only after the new URL is committed, so a failure here leaves the
    // product with a working image rather than a broken one.
    await removeStoredUrl(previous)

    await publish({
      type: EVENT.ProductImageUpdated,
      aggregateType: 'product',
      aggregateId: productId,
      actorUserId: user.id,
      payload: { bytes: stored.bytes, replaced: Boolean(previous) },
    })
  } catch (err) {
    return handle(err)
  }

  revalidatePath('/partner/catalogue')
  revalidatePath('/partner/inventory')
  revalidatePath('/admin/products')
  revalidatePath('/', 'layout')
  return { notice: `Photo added to ${product.name}.` }
}

/** A business sets its own logo. Owners only, and only their own business. */
export async function uploadOrgLogoAction(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/settings')

  const org = await organisationFor('settings')
  if (!org) return { error: 'Only the business owner can change the logo.' }

  const file = formData.get('image')
  if (!(file instanceof File)) return { error: 'Choose an image to upload.' }

  const sql = await getSql()
  const existing = await sql.one<{ logo_url: string | null }>(
    `SELECT logo_url FROM organisations WHERE id = $1`,
    [org.id],
  )

  try {
    const stored = await storeImage(file, 'logos')
    await sql.query(`UPDATE organisations SET logo_url = $2 WHERE id = $1`, [org.id, stored.url])
    await removeStoredUrl(existing?.logo_url)
  } catch (err) {
    return handle(err)
  }

  revalidatePath('/partner/settings')
  revalidatePath('/partner')
  revalidatePath('/', 'layout')
  return { notice: 'Your logo is live.' }
}

/** Exposed so the upload control can state the limit without duplicating it. */
export async function imageLimitMb(): Promise<number> {
  return MAX_IMAGE_BYTES / 1024 / 1024
}
