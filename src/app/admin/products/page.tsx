import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { moderateProductAction } from '@/app/actions/admin'
import { ProductImageUpload } from '@/components/media/ImageUpload'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { getSql } from '@/db/client'
import { listCategories } from '@/modules/catalog/service'
import { formatMoney } from '@/lib/money'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catalogue' }

interface CatalogRow {
  id: string
  name: string
  slug: string
  gtin: string | null
  image_url: string | null
  status: 'draft' | 'active' | 'blocked'
  requires_batch: boolean
  brand_name: string | null
  brand_logo: string | null
  category_name: string | null
  category_slug: string | null
  pack_size: string | null
  seller_count: number
  units_available: number
  cheapest: number | null
}

/**
 * Product moderation over the master catalogue. Blocking a product removes it
 * from discovery everywhere at once — which is the point of a shared
 * catalogue: one action, not one per seller.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>
}) {
  const params = await searchParams
  const admin = await requireRole(ADMIN_ROLES, '/admin/products')
  const readOnly = admin.role === 'auditor'

  const sql = await getSql()
  const filters: string[] = []
  const values: unknown[] = []

  if (params.q) {
    values.push(`%${params.q.toLowerCase()}%`)
    filters.push(`p.search_text LIKE $${values.length}`)
  }
  if (params.category) {
    values.push(params.category)
    filters.push(`p.category_id = $${values.length}`)
  }
  if (params.status) {
    values.push(params.status)
    filters.push(`p.status = $${values.length}`)
  }

  const [products, categories] = await Promise.all([
    sql.query<CatalogRow>(
      `SELECT p.id, p.name, p.slug, p.gtin, p.image_url, p.status, p.requires_batch,
              p.pack_size, b.name AS brand_name, b.logo_url AS brand_logo, c.name AS category_name,
              c.slug AS category_slug,
              COUNT(i.id) FILTER (WHERE i.is_listed AND i.qty_available > 0)::int AS seller_count,
              COALESCE(SUM(i.qty_available), 0)::int                              AS units_available,
              MIN(COALESCE(i.promo_price, i.retail_price))                        AS cheapest
         FROM products p
         LEFT JOIN brands b     ON b.id = p.brand_id
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN inventory_items i ON i.product_id = p.id
        ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
        GROUP BY p.id, b.name, b.logo_url, c.name, c.slug
        ORDER BY seller_count DESC, p.name ASC
        LIMIT 100`,
      values,
    ),
    listCategories(),
  ])

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v))
    return `/admin/products?${next.toString()}`
  }

  return (
    <AdminShell active="/admin/products">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Products' }]}
          title="Master product catalogue"
          subtitle="One record per product, shared by every seller — this is what makes cross-seller price comparison possible."
        />

        <Card className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" action="/admin/products">
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="pq">
                Search
              </label>
              <input
                id="pq"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Name, brand or barcode"
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            <Link
              href={href({ category: '' })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                !params.category
                  ? 'bg-accent-500 text-accent-ink'
                  : 'border border-line bg-surface text-muted'
              }`}
            >
              All categories
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={href({ category: c.id })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  params.category === c.id
                    ? 'bg-accent-500 text-accent-ink'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                {c.name}
              </Link>
            ))}
            <span className="mx-1 h-5 w-px bg-surface-strong" />
            {['', 'active', 'blocked'].map((s) => (
              <Link
                key={s || 'any'}
                href={href({ status: s })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  (params.status ?? '') === s
                    ? 'bg-surface-deep text-white'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                {s || 'Any status'}
              </Link>
            ))}
          </div>
        </Card>

        {products.length ? (
          <div className="space-y-2">
            {products.map((product) => (
              <Card key={product.id} className="flex flex-wrap items-center gap-3">
                <ProductThumb
                  name={product.name}
                  imageUrl={product.image_url}
                  brandLogo={product.brand_logo}
                  categorySlug={product.category_slug}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/product/${product.slug}`}
                      className="font-medium text-ink hover:text-accent-strong"
                    >
                      {product.name}
                    </Link>
                    {product.status === 'blocked' && <Badge tone="danger">Blocked</Badge>}
                    {product.requires_batch && <Badge tone="info">Batch tracked</Badge>}
                  </div>
                  <p className="truncate font-technical text-xs text-muted">
                    {[product.brand_name, product.category_name, product.pack_size, product.gtin]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {product.seller_count} seller{product.seller_count === 1 ? '' : 's'} ·{' '}
                    {product.units_available.toLocaleString()} units
                    {product.cheapest ? ` · from ${formatMoney(product.cheapest)}` : ''}
                  </p>
                </div>

                {!readOnly && (
                  <div className="w-full lg:w-72">
                    {/* Admins are the moderation path: they can always replace
                        a photo, including one a seller uploaded. */}
                    <ProductImageUpload
                      productId={product.id}
                      currentUrl={product.image_url}
                      canEdit
                    />
                  </div>
                )}

                {!readOnly && (
                  <form action={moderateProductAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={product.status === 'blocked' ? 'active' : 'blocked'}
                    />
                    <button
                      type="submit"
                      className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
                    >
                      {product.status === 'blocked' ? 'Unblock' : 'Block'}
                    </button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="tag" title="No products match those filters" />
        )}
      </div>
    </AdminShell>
  )
}
