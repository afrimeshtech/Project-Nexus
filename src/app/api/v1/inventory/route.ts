import { endpoint, pageSize } from '@/app/api/v1/_handler'
import { listInventory } from '@/modules/inventory/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/inventory — the calling business's own stock.
 *
 * Scoped to the key's organisation, never to a parameter. An integration can
 * only ever see the stock of the business that issued its key, which means
 * there is no object-reference to guess at and no tenancy check to forget.
 */
export const GET = endpoint('inventory:read', async ({ organisationId, searchParams }) => {
  const rows = await listInventory(organisationId, {
    search: searchParams.get('search') ?? undefined,
    lowOnly: searchParams.get('low') === 'true',
    limit: pageSize(searchParams),
  })

  // A deliberate projection rather than the raw row: an API response is a
  // contract, and returning `SELECT *` would make every internal column a
  // promise we have to keep.
  return rows.map((row) => ({
    id: row.id,
    product: {
      id: row.product_id,
      name: row.product_name,
      gtin: row.gtin,
      brand: row.brand_name,
      category: row.category_name,
      unitOfMeasure: row.unit_of_measure,
      packSize: row.pack_size,
    },
    stock: {
      available: row.qty_available,
      reserved: row.qty_reserved,
      incoming: row.qty_incoming,
      reorderLevel: row.reorder_level,
      lowStock: row.qty_available <= row.reorder_level,
    },
    pricing: {
      currency: row.currency,
      retailMinor: row.retail_price,
      wholesaleMinor: row.wholesale_price,
      promoMinor: row.promo_price,
      minOrderQty: row.min_order_qty,
    },
    listed: row.is_listed,
    updatedAt: row.updated_at,
  }))
})
