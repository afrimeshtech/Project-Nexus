import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { Card, EmptyState, LinkButton, PageHeader, Rating, SectionHeading } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { listFavourites } from '@/modules/favourites/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Saved' }

export default async function FavouritesPage() {
  const user = await requireUser('/favourites')
  const { products, sellers } = await listFavourites(user.id)

  if (!products.length && !sellers.length) {
    return (
      <ConsumerShell search={false}>
        <EmptyState
          icon="star-filled"
          title="Nothing saved yet"
          body="Save products you buy often and shops you trust, so restocking takes one tap."
          action={<LinkButton href="/search">Browse products</LinkButton>}
        />
      </ConsumerShell>
    )
  }

  return (
    <ConsumerShell search={false}>
      <div className="space-y-8">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Favourites' }]}
          title="Favourites"
          subtitle="Products you buy often and shops you trust, kept together so restocking takes one tap."
        />

        {products.length > 0 && (
          <section>
            <SectionHeading title="Saved products" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <Link key={product.id} href={`/product/${product.slug}`}>
                  <Card className="flex items-center gap-3 card-interactive hover:card-interactive-hover">
                    <ProductThumb name={product.name} imageUrl={product.image_url} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{product.name}</p>
                      <p className="text-xs text-muted">{product.category_name}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {sellers.length > 0 && (
          <section>
            <SectionHeading title="Saved shops" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sellers.map((seller) => (
                <Link key={seller.id} href={`/shop/${seller.slug}`}>
                  <Card className="flex items-center gap-3 card-interactive hover:card-interactive-hover">
                    <SellerThumb name={seller.name} logoUrl={seller.logo_url} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{seller.name}</p>
                      <p className="text-xs text-muted">{seller.city}</p>
                      <Rating value={seller.rating} count={seller.rating_count} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </ConsumerShell>
  )
}
