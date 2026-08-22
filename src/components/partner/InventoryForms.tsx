'use client'

import { useActionState, useState } from 'react'
import {
  addBatchAction,
  addListingAction,
  adjustStockAction,
  updatePricingAction,
  type InventoryActionState,
} from '@/app/actions/inventory'
import { Alert, Field, inputClass } from '@/components/ui'

/** List a catalogue product, or top up an existing listing after a delivery. */
export function ListProductForm({
  productId,
  productName,
  priceLabel,
  defaultMinOrderQty = 1,
  compact = false,
}: {
  productId: string
  productName: string
  priceLabel: string
  defaultMinOrderQty?: number
  compact?: boolean
}) {
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(
    addListingAction,
    {},
  )

  return (
    <form action={formAction} className={compact ? 'flex flex-wrap items-end gap-2' : 'space-y-3'}>
      <input type="hidden" name="productId" value={productId} />

      <div className={compact ? 'w-24' : ''}>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor={`qty-${productId}`}>
          Quantity
        </label>
        <input
          id={`qty-${productId}`}
          name="qty"
          type="number"
          min={0}
          defaultValue={0}
          className={inputClass}
          required
        />
      </div>

      <div className={compact ? 'w-32' : ''}>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor={`price-${productId}`}>
          {priceLabel}
        </label>
        <input
          id={`price-${productId}`}
          name="price"
          type="number"
          min={1}
          step="0.01"
          className={inputClass}
          required
        />
      </div>

      <div className={compact ? 'w-24' : ''}>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor={`moq-${productId}`}>
          Min order
        </label>
        <input
          id={`moq-${productId}`}
          name="minOrderQty"
          type="number"
          min={1}
          defaultValue={defaultMinOrderQty}
          className={inputClass}
        />
      </div>

      {!compact && (
        <Field
          label="Reorder level"
          hint="We alert you when stock falls to this."
          htmlFor={`rl-${productId}`}
        >
          <input
            id={`rl-${productId}`}
            name="reorderLevel"
            type="number"
            min={0}
            defaultValue={5}
            className={inputClass}
          />
        </Field>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add stock'}
      </button>

      {(state.error || state.notice) && (
        <p
          role="status"
          className={`w-full text-xs ${state.error ? 'text-coral-ink' : 'text-accent-strong'}`}
        >
          {state.error ?? `${productName}: ${state.notice}`}
        </p>
      )}
    </form>
  )
}

export function AdjustStockForm({ itemId, current }: { itemId: string; current: number }) {
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(
    adjustStockAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field label="Counted quantity" hint={`Currently recorded: ${current}`} htmlFor="adj-qty">
        <input
          id="adj-qty"
          name="qty"
          type="number"
          min={0}
          defaultValue={current}
          className={inputClass}
          required
        />
      </Field>
      <Field label="Reason" htmlFor="adj-note">
        <input
          id="adj-note"
          name="note"
          className={inputClass}
          placeholder="Stock count, damage, expiry…"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Record adjustment'}
      </button>
      <p className="text-xs text-muted">
        Adjustments are written to the inventory ledger and cannot be edited or deleted afterwards.
      </p>
    </form>
  )
}

export function PricingForm({
  itemId,
  price,
  promoPrice,
  minOrderQty,
  isListed,
  priceLabel,
}: {
  itemId: string
  price: number
  promoPrice: number | null
  minOrderQty: number
  isListed: boolean
  priceLabel: string
}) {
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(
    updatePricingAction,
    {},
  )
  const [listed, setListed] = useState(isListed)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field label={priceLabel} htmlFor="price">
        <input
          id="price"
          name="price"
          type="number"
          min={1}
          step="0.01"
          defaultValue={price / 100}
          className={inputClass}
          required
        />
      </Field>

      <Field
        label="Promotional price"
        hint="Leave blank for none. Must be below the normal price."
        htmlFor="promo"
      >
        <input
          id="promo"
          name="promoPrice"
          type="number"
          min={0}
          step="0.01"
          defaultValue={promoPrice ? promoPrice / 100 : ''}
          className={inputClass}
        />
      </Field>

      <Field label="Minimum order quantity" htmlFor="moq">
        <input
          id="moq"
          name="minOrderQty"
          type="number"
          min={1}
          defaultValue={minOrderQty}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isListed"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
          className="accent-accent-500"
        />
        <span className="text-ink">Visible to buyers</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save pricing'}
      </button>
    </form>
  )
}

export function AddBatchForm({ itemId }: { itemId: string }) {
  const [state, formAction, pending] = useActionState<InventoryActionState, FormData>(
    addBatchAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field label="Batch number" htmlFor="batch-no">
        <input id="batch-no" name="batchNumber" className={inputClass} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Manufactured" htmlFor="batch-mfg">
          <input id="batch-mfg" name="manufacturedOn" type="date" className={inputClass} />
        </Field>
        <Field label="Expires" htmlFor="batch-exp">
          <input id="batch-exp" name="expiresOn" type="date" className={inputClass} />
        </Field>
      </div>
      <Field label="Quantity in batch" htmlFor="batch-qty">
        <input id="batch-qty" name="qty" type="number" min={0} className={inputClass} />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Record batch'}
      </button>
    </form>
  )
}
