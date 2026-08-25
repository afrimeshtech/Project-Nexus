'use client'

import { useActionState } from 'react'
import { buildRestockBasketAction, type RestockState } from '@/app/actions/restock'
import { FormError, Alert } from '@/components/ui'

export function RestockButton({ lowCount }: { lowCount: number }) {
  const [state, formAction, pending] = useActionState<RestockState, FormData>(
    buildRestockBasketAction,
    {},
  )

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending || lowCount === 0}
          className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
        >
          {pending
            ? 'Finding suppliers…'
            : lowCount === 0
              ? 'Nothing needs restocking'
              : `Build a restock basket for ${lowCount} item${lowCount === 1 ? '' : 's'}`}
        </button>
      </form>
      <FormError>{state.error}</FormError>
      {state.notice && <Alert tone="info">{state.notice}</Alert>}
      <p className="text-xs text-muted">
        We pick the supplier that covers the most of your shortfall and fill a basket at wholesale
        prices. You review the total before anything is ordered.
      </p>
    </div>
  )
}
