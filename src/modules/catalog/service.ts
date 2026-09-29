import { getSql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { LAUNCH_CATEGORY_SLUGS } from '@/lib/launch-categories'

/**
 * MODULE: catalog - the Master Product Catalogue
 *
 * "A single source of truth for product information... it prevents duplicate
 * product records and keeps the ecosystem consistent."
 * - CTO Inventory Engineering Recommendation §1
 *
 * Sellers never create private product records; they list against a shared
 * catalogue entry. That is what makes cross-seller price comparison possible
 * at all, and what lets a barcode scanned in one shop resolve everywhere.
 */

export interface Product {
  id: string
  gtin: string | null
  sku: string | null
  name: string
  slug: string
  brand_id: string | null
  category_id: string | null
  unit_of_measure: string
  pack_size: string | null
  description: string | null
  image_url: string | null
  requires_batch: boolean
  status: 'draft' | 'active' | 'blocked'
  created_at: Date
}

export interface ProductDetail extends Product {
  brand_name: string | null
  /** Logo of the company that makes it; the fallback when there is no photo. */
  brand_logo: string | null
  category_name: string | null
  category_slug: string | null
}

export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  icon: string | null
  sort_order: number
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

/**
 * The denormalised document the search predicate matches against. Keeping
 * brand and category in it means "peak milk" and "dangote cement" both hit
 * even though neither phrase is the product name alone.
 */
function buildSearchText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export async function createProduct(input: {
  name: string
  gtin?: string | null
  sku?: string | null
  brandId?: string | null
  categoryId?: string | null
  unitOfMeasure?: string
  packSize?: string | null
  description?: string | null
  imageUrl?: string | null
  requiresBatch?: boolean
  actorUserId?: string | null
}): Promise<Product> {
  const sql = await getSql()

  // Barcode is the strongest identity signal; reuse rather than duplicate.
  if (input.gtin) {
    const existing = await sql.one<Product>(`SELECT * FROM products WHERE gtin = $1`, [input.gtin])
    if (existing) return existing
  }

  const brand = input.brandId
    ? await sql.one<{ name: string }>(`SELECT name FROM brands WHERE id = $1`, [input.brandId])
    : null
  const category = input.categoryId
    ? await sql.one<{ name: string }>(`SELECT name FROM categories WHERE id = $1`, [
        input.categoryId,
      ])
    : null

  let slug = slugify(input.name)
  const clash = await sql.one<{ id: string }>(`SELECT id FROM products WHERE slug = $1`, [slug])
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

  const searchText = buildSearchText([
    input.name,
    brand?.name,
    category?.name,
    input.packSize,
    input.gtin,
    input.sku,
  ])

  const product = await sql.one<Product>(
    `INSERT INTO products
       (gtin, sku, name, slug, brand_id, category_id, unit_of_measure, pack_size,
        description, image_url, requires_batch, search_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      input.gtin ?? null,
      input.sku ?? null,
      input.name.trim(),
      slug,
      input.brandId ?? null,
      input.categoryId ?? null,
      input.unitOfMeasure ?? 'unit',
      input.packSize ?? null,
      input.description ?? null,
      input.imageUrl ?? null,
      input.requiresBatch ?? false,
      searchText,
    ],
  )
  if (!product) throw new Error('Failed to create product')

  await publish({
    type: EVENT.ProductCreated,
    aggregateType: 'product',
    aggregateId: product.id,
    actorUserId: input.actorUserId,
    payload: { name: product.name, gtin: product.gtin },
  })

  return product
}

export async function getProduct(idOrSlug: string): Promise<ProductDetail | null> {
  const sql = await getSql()
  return sql.one<ProductDetail>(
    `SELECT p.*, b.name AS brand_name, b.logo_url AS brand_logo, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN brands b     ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1 OR p.id::text = $1`,
    [idOrSlug],
  )
}

export async function getProductByBarcode(gtin: string): Promise<ProductDetail | null> {
  const sql = await getSql()
  return sql.one<ProductDetail>(
    `SELECT p.*, b.name AS brand_name, b.logo_url AS brand_logo, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN brands b     ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.gtin = $1`,
    [gtin.trim()],
  )
}

/**
 * Slugs of every product worth putting in the sitemap.
 *
 * Only products a seller actually has listed: a catalogue entry nobody stocks
 * resolves to a page that tells the visitor no one nearby has it, and sending
 * a crawler to a thousand of those earns the site nothing.
 */
export async function listProductSlugs(
  limit = 5_000,
): Promise<{ slug: string; created_at: Date }[]> {
  const sql = await getSql()
  return sql.query<{ slug: string; created_at: Date }>(
    `SELECT DISTINCT p.slug, p.created_at
       FROM products p
       JOIN inventory_items i ON i.product_id = p.id AND i.is_listed = true
      ORDER BY p.created_at DESC
      LIMIT $1`,
    [limit],
  )
}

/**
 * Categories to list, limited to the ones the MVP launches with (see
 * `LAUNCH_CATEGORY_SLUGS`). `includeSilenced` is for the admin console, which
 * manages the whole catalogue and has to be able to filter all of it.
 */
export async function listCategories(
  opts: { includeSilenced?: boolean } = {},
): Promise<Category[]> {
  const sql = await getSql()
  if (opts.includeSilenced) {
    return sql.query<Category>(`SELECT * FROM categories ORDER BY sort_order ASC, name ASC`)
  }
  return sql.query<Category>(
    `SELECT * FROM categories WHERE slug = ANY($1::text[]) ORDER BY sort_order ASC, name ASC`,
    [[...LAUNCH_CATEGORY_SLUGS]],
  )
}

/**
 * Resolve a brand by name, creating it if it is genuinely new.
 *
 * Matched on the slug rather than the raw string, so "Coca Cola", "coca-cola"
 * and "Coca-Cola" all land on one brand instead of three.
 */
export async function findOrCreateBrand(
  name: string,
  logoUrl?: string | null,
): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const sql = await getSql()
  const slug = slugify(trimmed)

  const existing = await sql.one<{ id: string; logo_url: string | null }>(
    `SELECT id, logo_url FROM brands WHERE slug = $1`,
    [slug],
  )
  if (existing) {
    // Fill a gap, never overwrite. A brand mark is shared across every seller
    // carrying that brand, so the same rule as product photos applies.
    if (logoUrl && !existing.logo_url) {
      await sql.query(`UPDATE brands SET logo_url = $2 WHERE id = $1`, [existing.id, logoUrl])
    }
    return existing.id
  }

  const created = await sql.one<{ id: string }>(
    `INSERT INTO brands (name, slug, logo_url) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = brands.name
     RETURNING id`,
    [trimmed, slug, logoUrl ?? null],
  )
  return created?.id ?? null
}

/**
 * Catalogue entries whose name is close to the given one.
 *
 * Used to warn a seller before they create a near-duplicate. The master
 * catalogue only works as a single source of truth if it stays one entry per
 * real product (Inventory doc §1).
 */
export async function findSimilarProducts(name: string, limit = 4) {
  const words = name
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3)
  if (!words.length) return []

  const sql = await getSql()
  return sql.query<{ id: string; name: string; slug: string; pack_size: string | null }>(
    `SELECT id, name, slug, pack_size
       FROM products
      WHERE status = 'active'
        AND search_text LIKE ANY($1::text[])
      LIMIT $2`,
    [words.map((word) => `%${word}%`), limit],
  )
}

export async function listBrands(): Promise<{ id: string; name: string; slug: string }[]> {
  const sql = await getSql()
  return sql.query(`SELECT id, name, slug FROM brands ORDER BY name ASC`)
}

/**
 * Catalogue browse used by sellers adding stock: every product, with whether
 * this organisation already lists it.
 */
export async function catalogueForSeller(
  organisationId: string,
  opts: { search?: string; categoryId?: string; limit?: number } = {},
) {
  const sql = await getSql()
  const params: unknown[] = [organisationId]
  const where: string[] = [`p.status = 'active'`]

  if (opts.search) {
    params.push(`%${opts.search.toLowerCase()}%`)
    where.push(`p.search_text LIKE $${params.length}`)
  }
  if (opts.categoryId) {
    params.push(opts.categoryId)
    where.push(`p.category_id = $${params.length}`)
  }
  params.push(opts.limit ?? 60)

  return sql.query<
    ProductDetail & {
      already_listed: boolean
      inventory_item_id: string | null
      qty_available: number | null
    }
  >(
    `SELECT p.*, b.name AS brand_name, b.logo_url AS brand_logo, c.name AS category_name, c.slug AS category_slug,
            (i.id IS NOT NULL) AS already_listed,
            i.id AS inventory_item_id,
            i.qty_available
       FROM products p
       LEFT JOIN brands b     ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory_items i ON i.product_id = p.id AND i.organisation_id = $1
      WHERE ${where.join(' AND ')}
      ORDER BY already_listed ASC, p.name ASC
      LIMIT $${params.length}`,
    params,
  )
}

/** Admin moderation (PRD Admin Module: "Product moderation"). */
export async function setProductStatus(
  productId: string,
  status: 'draft' | 'active' | 'blocked',
  actorUserId?: string | null,
): Promise<void> {
  const sql = await getSql()
  await sql.query(`UPDATE products SET status = $2 WHERE id = $1`, [productId, status])
  if (status === 'blocked') {
    await publish({
      type: EVENT.ProductBlocked,
      aggregateType: 'product',
      aggregateId: productId,
      actorUserId,
    })
  }
}
