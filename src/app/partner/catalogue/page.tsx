import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { ListProductForm } from '@/components/partner/InventoryForms'
import { ProductImageUpload } from '@/components/media/ImageUpload'
import { NewProductForm } from '@/components/partner/NewProductForm'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { catalogueForSeller, listCategories } from '@/modules/catalog/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add products' }

/**
 * Sellers list against the shared master catalogue rather than creating their
 * own product records. That is what makes cross-seller price comparison work
 * at all, and it means a barcode scanned in one shop resolves everywhere.
 */
export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const params = await searchParams
  await requireUser('/partner/catalogue')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const [products, categories] = await Promise.all([
    catalogueForSeller(org.id, { search: params.q, categoryId: params.category, limit: 80 }),
    listCategories(),
  ])

  const isRetail = org.type === 'outlet'
  const isVerified = org.verification === 'verified'
  const priceLabel = isRetail ? 'Retail ₦' : 'Wholesale ₦'
  const defaultMoq = { outlet: 1, merchant: 5, warehouse: 20, manufacturer: 50, logistics: 1 }[
    org.type
  ]

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, String(v))
    return `/partner/catalogue?${next.toString()}`
  }

  return (
    <PartnerShell active="/partner/catalogue">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Add products' }]}
          title="Add products to your inventory"
          subtitle="Pick from the master catalogue, set your quantity and your price — or add a product that is not listed yet."
        />

        <Card>
          <NewProductForm
            categories={categories}
            isRetail={isRetail}
            defaultMinOrderQty={defaultMoq}
            canAdd={isVerified}
          />
        </Card>

        <Card className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" action="/partner/catalogue">
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="cat-q">
                Find a product
              </label>
              <input
                id="cat-q"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Name, brand or barcode"
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            {params.category && <input type="hidden" name="category" value={params.category} />}
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
              All
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
                {c.icon} {c.name}
              </Link>
            ))}
          </div>
        </Card>

        {products.length ? (
          <div className="space-y-2">
            {products.map((product) => (
              <Card key={product.id} className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ProductThumb
                    name={product.name}
                    imageUrl={product.image_url}
                    brandLogo={product.brand_logo}
                    categorySlug={product.category_slug}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-ink">{product.name}</p>
                      {product.already_listed && (
                        <Badge tone="brand">Listed · {product.qty_available ?? 0} in stock</Badge>
                      )}
                      {product.requires_batch && <Badge tone="info">Batch tracked</Badge>}
                    </div>
                    <p className="truncate font-technical text-xs text-muted">
                      {[product.brand_name, product.category_name, product.pack_size, product.gtin]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <ListProductForm
                  productId={product.id}
                  productName={product.name}
                  priceLabel={priceLabel}
                  defaultMinOrderQty={defaultMoq}
                  compact
                />

                {/* A photo can only be added once the product is on your
                    shelf, and only where the shared catalogue has none. */}
                {product.already_listed && !product.image_url && (
                  <div className="w-full border-t border-line-soft pt-3 lg:w-72 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                    <p className="mb-1.5 text-xs font-medium text-ink">This product has no photo</p>
                    <ProductImageUpload
                      productId={product.id}
                      currentUrl={product.image_url}
                      canEdit={isVerified}
                      reason="Your business must be verified before you can add product photos."
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title="Nothing in the catalogue matched"
            body="Try a different search term or category."
          />
        )}
      </div>
    </PartnerShell>
  )
}
