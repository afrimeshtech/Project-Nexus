'use client'

import { useActionState, useState, useTransition } from 'react'
import { addToCartAction, updateCartQtyAction, type CartActionState } from '@/app/actions/cart'
import { Icon } from '@/components/Icon'

/**
 * Quantity stepper + add, in whichever of two presentations the caller
 * needs. Dispatches rather than branching internally so each presentation's
 * hooks stay unconditional — see `StandardAddToCart` and `OverlayStepper`.
 */
export function AddToCart({
  inventoryItemId,
  minOrderQty = 1,
  maxQty,
  mode = 'consumer',
  compact = false,
  overlay = false,
  cartQty = 0,
}: {
  inventoryItemId: string
  minOrderQty?: number
  maxQty?: number
  mode?: 'consumer' | 'sourcing'
  compact?: boolean
  /**
   * The stepper-on-the-photo-well presentation: a pill overlapping the
   * product thumb's corner. Below `cartQty > 0` it's a single add trigger;
   * at and above it, the full −/qty/+ stepper, wired straight to
   * `updateCartQtyAction` — the same absolute-set action the basket page
   * already uses — so every tap commits one real quantity server-side
   * rather than staging a number behind a separate Add press.
   */
  overlay?: boolean
  /** The quantity of this exact inventory item already in the basket, if any. */
  cartQty?: number
}) {
  if (overlay) {
    return (
      <OverlayStepper
        inventoryItemId={inventoryItemId}
        minOrderQty={minOrderQty}
        maxQty={maxQty ?? 9999}
        mode={mode}
        cartQty={cartQty}
      />
    )
  }

  return (
    <StandardAddToCart
      inventoryItemId={inventoryItemId}
      minOrderQty={minOrderQty}
      maxQty={maxQty}
      mode={mode}
      compact={compact}
    />
  )
}

function StandardAddToCart({
  inventoryItemId,
  minOrderQty = 1,
  maxQty,
  mode = 'consumer',
  compact = false,
}: {
  inventoryItemId: string
  minOrderQty?: number
  maxQty?: number
  mode?: 'consumer' | 'sourcing'
  compact?: boolean
}) {
  const [state, formAction, pending] = useActionState<CartActionState, FormData>(
    addToCartAction,
    {},
  )
  const [qty, setQty] = useState(minOrderQty)
  const ceiling = maxQty ?? 9999

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="qty" value={qty} />

      <div className={compact ? 'flex items-center gap-2' : 'space-y-2'}>
        {!compact && (
          <div className="inline-flex items-center rounded-brand border border-line">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(minOrderQty, q - 1))}
              className="px-3 py-2 text-lg leading-none text-muted hover:text-ink"
            >
              −
            </button>
            <span className="min-w-10 text-center text-sm font-semibold">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(ceiling, q + 1))}
              className="px-3 py-2 text-lg leading-none text-muted hover:text-ink"
            >
              +
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className={`rounded-brand bg-accent-500 font-semibold text-accent-ink transition-colors hover:bg-accent-600 disabled:opacity-60 ${
            compact ? 'px-3 py-1.5 text-xs' : 'w-full px-4 py-2.5 text-sm'
          }`}
        >
          {pending ? 'Adding…' : compact ? 'Add' : 'Add to basket'}
        </button>
      </div>

      {(state.error || state.notice) && (
        <p
          role="status"
          className={`mt-2 text-xs ${state.error ? 'text-coral-ink' : 'text-accent-strong'}`}
        >
          {state.error ?? state.notice}
        </p>
      )}
      {minOrderQty > 1 && !compact && (
        <p className="mt-1.5 text-xs text-muted">Minimum order: {minOrderQty} units</p>
      )}
    </form>
  )
}

/**
 * The corner-overlapping pill. At `qty === 0` a single 44px add trigger —
 * the 44px pointer-coarse floor, not the 30px this reads at in the original
 * mockup, since the well this sits on grows to accommodate it (`size="lg"`
 * on `ProductThumb`, not `size="md"`). Once something is in the basket, the
 * same slot becomes the live stepper: every tap sets the absolute quantity
 * through `updateCartQtyAction`, the action the basket page already uses, so
 * this never drifts into a second, competing idea of "how many."
 */
function OverlayStepper({
  inventoryItemId,
  minOrderQty,
  maxQty,
  mode,
  cartQty,
}: {
  inventoryItemId: string
  minOrderQty: number
  maxQty: number
  mode: 'consumer' | 'sourcing'
  cartQty: number
}) {
  const [qty, setQty] = useState(cartQty)
  const [pending, startTransition] = useTransition()

  if (qty <= 0) {
    return (
      <button
        type="button"
        aria-label="Add to basket"
        disabled={pending}
        onClick={() => {
          const optimistic = minOrderQty
          setQty(optimistic)
          startTransition(async () => {
            const fd = new FormData()
            fd.set('inventoryItemId', inventoryItemId)
            fd.set('qty', String(minOrderQty))
            fd.set('mode', mode)
            const result = await addToCartAction({}, fd)
            if (result.error) setQty(0)
          })
        }}
        className="grid size-11 place-items-center rounded-full border-2 border-surface bg-accent-500 text-accent-ink shadow-subtle transition-colors hover:bg-accent-600 disabled:opacity-60"
      >
        <Icon name="plus" size={18} />
      </button>
    )
  }

  const commit = (next: number) => {
    const clamped = Math.max(0, Math.min(maxQty, next))
    setQty(clamped)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('inventoryItemId', inventoryItemId)
      fd.set('qty', String(clamped))
      await updateCartQtyAction(fd)
    })
  }

  return (
    <div className="flex h-11 items-center rounded-full border-2 border-surface bg-accent-500 text-accent-ink shadow-subtle">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={pending}
        onClick={() => commit(qty - 1)}
        className="grid size-9 place-items-center text-base font-semibold leading-none disabled:opacity-60"
      >
        −
      </button>
      <span className="min-w-[1.25rem] text-center font-technical text-xs font-bold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={pending || qty >= maxQty}
        onClick={() => commit(qty + 1)}
        className="grid size-9 place-items-center text-base font-semibold leading-none disabled:opacity-60"
      >
        +
      </button>
    </div>
  )
}
