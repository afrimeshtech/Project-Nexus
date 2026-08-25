import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Icon } from '@/components/Icon'
import {
  Badge,
  EmptyState,
  ItemCard,
  LinkButton,
  PageHeader,
  Stat,
  Toolbar,
  inputWithIconClass,
  stockState,
} from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { inventoryStats, listInventory } from '@/modules/inventory/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventory' }

/**
 * The seller's view of their own stock. Available, reserved and sold are shown
 * separately, because "20 units" means something different when 8 of them are
 * already spoken for by a paid order.
 *
 * A card grid rather than a table: stock is judged one product at a time — is
 * this one running out, is it priced right — and a card puts the photo, the
 * state and the two numbers that answer that in one place. The four figures
 * are kept as label/value rows so the grid still reads down a column the way
 * the table did, rather than losing information to the layout.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>
}) {
  const params = await searchParams
  await requireUser('/partner/inventory')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const [items, stats] = await Promise.all([
    listInventory(org.id, { search: params.q, lowOnly: params.filter === 'low' }),
    inventoryStats(org.id),
  ])

  const isRetail = org.type === 'outlet'
  const priceLabel = isRetail ? 'Retail price' : 'Wholesale price'
  const lowOnly = params.filter === 'low'

  return (
    <PartnerShell active="/partner/inventory">
      <PageHeader
        breadcrumb={[{ label: 'Dashboard', href: '/partner' }, { label: 'Inventory' }]}
        title="Inventory"
        subtitle="Your stock, published live to the network."
        actions={
          <>
            <LinkButton href="/partner/catalogue" variant="secondary">
              Browse catalogue
            </LinkButton>
            <LinkButton href="/partner/catalogue">Add products</LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Products" value={stats.skus} />
        <Stat label="Available" value={stats.units_available.toLocaleString()} />
        <Stat
          label="Reserved"
          value={stats.units_reserved.toLocaleString()}
          hint="Held on live orders"
        />
        <Stat
          label="Low stock"
          value={stats.low_stock}
          tone={stats.low_stock ? 'danger' : 'neutral'}
        />
        <Stat label="Stock value" value={formatMoney(stats.stock_value)} />
      </div>

      <Toolbar
        meta={[
          { label: 'Products', value: stats.skus },
          { label: 'Available', value: stats.units_available.toLocaleString() },
          { label: 'Reserved', value: stats.units_reserved.toLocaleString() },
          { label: 'Stock value', value: formatMoney(stats.stock_value) },
        ]}
      >
        <form className="flex min-w-0 flex-1 items-center gap-2" action="/partner/inventory">
          <div className="field-with-icon min-w-0 flex-1 sm:max-w-md">
            <Icon name="search" size={16} className="field-icon" />
            <label className="sr-only" htmlFor="inv-q">
              Search your stock
            </label>
            <input
              id="inv-q"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder="Product name or barcode"
              className={inputWithIconClass}
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-brand bg-brand-deep px-4 py-2 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>

        <Link
          href={lowOnly ? '/partner/inventory' : '/partner/inventory?filter=low'}
          aria-pressed={lowOnly}
          className={`shrink-0 rounded-brand border px-3.5 py-2 text-sm font-medium ${
            lowOnly
              ? 'border-brand-deep bg-surface-muted text-brand-deep'
              : 'border-line bg-surface text-muted hover:text-ink'
          }`}
        >
          Needs restocking
        </Link>
      </Toolbar>

      {items.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const price = isRetail ? item.retail_price : item.wholesale_price
            const state = stockState(item.qty_available, item.reorder_level)
            return (
              <li key={item.id} className="flex">
                <ItemCard
                  name={item.product_name}
                  href={`/partner/inventory/${item.id}`}
                  identifier={
                    [item.brand_name, item.pack_size, item.gtin].filter(Boolean).join(' · ') ||
                    undefined
                  }
                  media={
                    <ProductThumb
                      name={item.product_name}
                      imageUrl={item.product_image}
                      brandLogo={item.brand_logo}
                      categorySlug={item.category_slug}
                      size="xl"
                    />
                  }
                  state={state}
                  rows={[
                    { label: 'Available', value: item.qty_available },
                    { label: 'Reserved', value: item.qty_reserved },
                    { label: 'Sold', value: item.qty_sold },
                    {
                      label: priceLabel,
                      value: item.promo_price ? (
                        <>
                          <span className="text-accent-strong">
                            {formatMoney(item.promo_price)}
                          </span>
                          <span className="ml-1.5 font-normal text-muted line-through">
                            {formatMoney(price)}
                          </span>
                        </>
                      ) : (
                        formatMoney(price)
                      ),
                    },
                  ]}
                  footer={
                    !item.is_listed ? (
                      <p className="mt-2.5">
                        <Badge tone="neutral">Hidden from buyers</Badge>
                      </p>
                    ) : undefined
                  }
                  action="Manage stock"
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          icon="box"
          title={params.q ? 'Nothing matched that search' : 'No stock listed yet'}
          body="List a product from the master catalogue and it becomes discoverable to buyers near you."
          action={<LinkButton href="/partner/catalogue">Browse the catalogue</LinkButton>}
        />
      )}
    </PartnerShell>
  )
}
