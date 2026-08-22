'use client'

import { useActionState, useState } from 'react'
import { addToCartAction, type CartActionState } from '@/app/actions/cart'

/**
 * Quantity stepper + add. One primary action, large touch targets, and the
 * result of the action is announced inline rather than as a toast that a
 * screen reader might miss.
 */
export function AddToCart({
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
