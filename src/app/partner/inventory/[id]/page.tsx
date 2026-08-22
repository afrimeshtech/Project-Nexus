import { notFound, redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { AddBatchForm, AdjustStockForm, PricingForm } from '@/components/partner/InventoryForms'
import { ProductImageUpload } from '@/components/media/ImageUpload'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Breadcrumb, Badge, Card, SectionHeading, Stat } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { getInventoryItem, inventoryLedger, listBatches } from '@/modules/inventory/service'

export const dynamic = 'force-dynamic'

const MOVEMENT_LABEL: Record<string, string> = {
  received: 'Stock received',
  transferred: 'Transferred',
  sale: 'Sold',
  return: 'Returned',
  adjustment: 'Adjustment',
  damage: 'Damaged',
  expiry: 'Expired',
  reserved: 'Reserved for an order',
  released: 'Reservation released',
}

/** One listing: its live position, its pricing, its batches and its full history. */
export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser('/partner/inventory')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const item = await getInventoryItem(id)
  if (!item || item.organisation_id !== org.id) notFound()

  const [ledger, batches] = await Promise.all([inventoryLedger(id, 40), listBatches(id)])

  const isRetail = org.type === 'outlet'
  const price = (isRetail ? item.retail_price : item.wholesale_price) ?? 0

  return (
    <PartnerShell active="/partner/inventory">
      <div className="space-y-7">
        <Breadcrumb
          trail={[
            { label: 'Dashboard', href: '/partner' },
            { label: 'Inventory', href: '/partner/inventory' },
            { label: item.product_name },
          ]}
        />

        <Card className="flex items-center gap-4">
          <ProductThumb
            name={item.product_name}
            imageUrl={item.product_image}
            brandLogo={item.brand_logo}
            categorySlug={item.category_slug}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-display-sm text-ink">{item.product_name}</h1>
            <p className="text-sm text-muted">
              {[item.brand_name, item.category_name, item.pack_size].filter(Boolean).join(' · ')}
            </p>
            {item.gtin && <p className="font-technical text-xs text-muted">Barcode {item.gtin}</p>}
          </div>
          {item.requires_batch && <Badge tone="info">Batch tracked</Badge>}
        </Card>

        <Card>
          <SectionHeading
            title="Product photo"
            subtitle={
              item.product_image
                ? 'Shown to buyers across search, product and shop pages. Shared by every seller listing this product.'
                : 'A listing with a photo is chosen far more often than one without.'
            }
          />
          <ProductImageUpload
            productId={item.product_id}
            currentUrl={item.product_image}
            canEdit={org.verification === 'verified' && !item.product_image}
            reason={
              item.product_image
                ? 'This product already has a photo. It comes from the shared catalogue, so it cannot be replaced by one seller. Contact support if it is wrong.'
                : 'Your business must be verified before you can add product photos.'
            }
          />
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Available" value={item.qty_available} />
          <Stat label="Reserved" value={item.qty_reserved} hint="On live orders" />
          <Stat label="Sold" value={item.qty_sold} />
          <Stat label="Returned" value={item.qty_returned} />
          <Stat label="Stock value" value={formatMoney(price * item.qty_available)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <SectionHeading title="Stock count" />
            <AdjustStockForm itemId={item.id} current={item.qty_available} />
          </Card>

          <Card>
            <SectionHeading title="Pricing" />
            <PricingForm
              itemId={item.id}
              price={price}
              promoPrice={item.promo_price}
              minOrderQty={item.min_order_qty}
              isListed={item.is_listed}
              priceLabel={isRetail ? 'Retail price (₦)' : 'Wholesale price (₦)'}
            />
          </Card>

          <Card>
            <SectionHeading
              title="Batches"
              subtitle={item.requires_batch ? 'Required for this product' : 'Optional'}
            />
            {batches.length > 0 && (
              <ul className="mb-4 space-y-1.5 text-sm">
                {batches.map((batch) => (
                  <li key={batch.id} className="flex items-center justify-between gap-3">
                    <span className="font-technical text-xs text-ink">{batch.batch_number}</span>
                    <span className="text-xs text-muted">
                      {batch.qty} units
                      {batch.expires_on &&
                        ` · exp ${new Date(batch.expires_on).toLocaleDateString('en-NG', {
                          month: 'short',
                          year: 'numeric',
                        })}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <AddBatchForm itemId={item.id} />
          </Card>
        </div>

        <Card>
          <SectionHeading
            title="Inventory ledger"
            subtitle="Append-only. Every movement of this product, permanently."
          />
          <div className="scroll-x">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Inventory ledger for {item.product_name}</caption>
              <thead>
                <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Movement</th>
                  <th className="py-2 pr-3 text-right font-medium">Change</th>
                  <th className="py-2 pr-3 text-right font-medium">Available after</th>
                  <th className="py-2 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-line-soft last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-3 font-technical text-xs text-muted">
                      {new Date(row.created_at).toLocaleString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 pr-3 text-ink">
                      {MOVEMENT_LABEL[row.movement] ?? row.movement}
                      {row.note && <span className="block text-xs text-muted">{row.note}</span>}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right font-medium ${
                        row.qty_delta > 0 ? 'text-accent-strong' : 'text-ink'
                      }`}
                    >
                      {row.qty_delta > 0 ? '+' : ''}
                      {row.qty_delta}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">{row.qty_after}</td>
                    <td className="py-2.5 font-technical text-xs text-muted">
                      {row.reference_type ? `${row.reference_type}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PartnerShell>
  )
}
