'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { createAndListProductAction, type NewProductState } from '@/app/actions/catalogue'
import { FormError, Alert, Field, inputClass } from '@/components/ui'

const MAX_MB = 2

/**
 * Add a product the catalogue does not have yet, with its photo, quantity and
 * price captured in one pass.
 *
 * Collapsed by default: searching the existing catalogue is the path we want
 * people to take first, because listing an existing entry is what makes
 * cross-seller price comparison work.
 */
export function NewProductForm({
  categories,
  isRetail,
  defaultMinOrderQty,
  canAdd,
  blockedReason,
}: {
  categories: { id: string; name: string; icon: string | null }[]
  isRetail: boolean
  defaultMinOrderQty: number
  canAdd: boolean
  blockedReason?: string
}) {
  const [state, formAction, pending] = useActionState<NewProductState, FormData>(
    createAndListProductAction,
    {},
  )
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [brandPreview, setBrandPreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  if (!canAdd) {
    return (
      <p className="text-sm text-muted">
        {blockedReason ?? 'Your business must be verified before you can add new products.'}
      </p>
    )
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Selling something that is not in the list above? Add it to the catalogue with its photo.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600"
        >
          Add a new product
        </button>
      </div>
    )
  }

  function pick(event: React.ChangeEvent<HTMLInputElement>, set: (url: string | null) => void) {
    const file = event.target.files?.[0]
    setImageError(null)
    if (!file) {
      set(null)
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setImageError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`,
      )
      event.target.value = ''
      set(null)
      return
    }
    set(URL.createObjectURL(file))
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.notice && <Alert tone="success">{state.notice}</Alert>}
      <FormError>{state.error}</FormError>

      {/* Shown once, when a near-match exists. Listing one of these is almost
          always the better outcome for both the seller and buyers. */}
      {state.similar && state.similar.length > 0 && (
        <div className="rounded-brand border border-warning/40 bg-warning/15 p-3">
          <p className="text-sm font-medium text-warning-ink">Already in the catalogue:</p>
          <ul className="mt-1.5 space-y-1">
            {state.similar.map((product) => (
              <li key={product.id} className="text-sm text-warning-ink">
                ·{' '}
                <Link href={`/product/${product.slug}`} className="underline" target="_blank">
                  {product.name}
                </Link>
                {product.pack_size && (
                  <span className="text-warning-ink"> — {product.pack_size}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warning-ink">
            Search for it above and add your stock to that entry. If yours is genuinely different,
            tick the box below and submit again.
          </p>
          <label className="mt-2 flex items-center gap-2 text-sm text-warning-ink">
            <input type="checkbox" name="confirmed" value="yes" className="accent-accent-500" />
            This is a different product
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name" htmlFor="np-name">
          <input
            id="np-name"
            name="name"
            className={inputClass}
            placeholder="e.g. Titus Sardine 125g"
            required
          />
        </Field>

        <Field label="Category" htmlFor="np-category">
          <select
            id="np-category"
            name="categoryId"
            className={inputClass}
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon ? `${category.icon} ` : ''}
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Brand"
          hint="Optional. New brands are created automatically."
          htmlFor="np-brand"
        >
          <input id="np-brand" name="brand" className={inputClass} placeholder="e.g. Titus" />
        </Field>

        <Field label="Pack size" hint="What one unit contains." htmlFor="np-pack">
          <input id="np-pack" name="packSize" className={inputClass} placeholder="e.g. 125 g" />
        </Field>

        <Field label="Sold as" htmlFor="np-uom">
          <select id="np-uom" name="unitOfMeasure" className={inputClass} defaultValue="unit">
            {[
              'unit',
              'pack',
              'carton',
              'bag',
              'bottle',
              'tin',
              'sachet',
              'crate',
              'length',
              'set',
            ].map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Barcode"
          hint="Optional, but it stops duplicates and lets buyers scan the pack."
          htmlFor="np-gtin"
        >
          <input
            id="np-gtin"
            name="gtin"
            inputMode="numeric"
            className={inputClass}
            placeholder="8 to 14 digits"
          />
        </Field>
      </div>

      {/* Either image identifies the product. A photo of the pack is best, but
          a shop that has none usually knows the maker, and a recognised brand
          mark beats a pair of initials. Both optional; either one is used. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageSlot
          name="image"
          label="Photo of the product"
          hint={`A picture of the actual pack · up to ${MAX_MB} MB`}
          preview={preview}
          onChange={(event) => pick(event, setPreview)}
          shape="rounded-brand"
        />
        <ImageSlot
          name="brandImage"
          label="Or the logo of the company that makes it"
          hint="Used when there is no photo of the pack"
          preview={brandPreview}
          onChange={(event) => pick(event, setBrandPreview)}
          shape="rounded-full"
        />
      </div>
      {imageError && <p className="text-xs text-coral-ink">{imageError}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Quantity you have" htmlFor="np-qty">
          <input
            id="np-qty"
            name="qty"
            type="number"
            min={0}
            defaultValue={0}
            className={inputClass}
            required
          />
        </Field>
        <Field label={isRetail ? 'Retail price (₦)' : 'Wholesale price (₦)'} htmlFor="np-price">
          <input
            id="np-price"
            name="price"
            type="number"
            min={1}
            step="0.01"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Minimum order" htmlFor="np-moq">
          <input
            id="np-moq"
            name="minOrderQty"
            type="number"
            min={1}
            defaultValue={defaultMinOrderQty}
            className={inputClass}
          />
        </Field>
        <Field label="Reorder level" hint="We alert you here." htmlFor="np-reorder">
          <input
            id="np-reorder"
            name="reorderLevel"
            type="number"
            min={0}
            defaultValue={5}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? 'Adding…' : 'Add product and list it'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-brand border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-muted">
        New products join the shared catalogue, so every seller can list them and buyers can compare
        prices across shops. A platform administrator can moderate them afterwards.
      </p>
    </form>
  )
}

function ImageSlot({
  name,
  label,
  hint,
  preview,
  onChange,
  shape,
}: {
  name: string
  label: string
  hint: string
  preview: string | null
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  shape: string
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className={`h-16 w-16 shrink-0 object-cover ${shape}`} />
        ) : (
          <span
            aria-hidden
            className={`grid h-16 w-16 shrink-0 place-items-center border border-dashed border-line text-lg text-muted ${shape}`}
          >
            +
          </span>
        )}
        <div className="min-w-0 flex-1">
          <input
            type="file"
            name={name}
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={onChange}
            aria-label={label}
            className="block w-full text-xs text-muted file:mr-3 file:rounded-brand file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink hover:file:bg-surface-strong"
          />
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
      </div>
    </div>
  )
}
