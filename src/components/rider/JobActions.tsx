'use client'

import { useActionState, useState } from 'react'
import {
  acceptJobAction,
  completeDeliveryAction,
  pickUpAction,
  type DeliveryActionState,
} from '@/app/actions/logistics'
import { FormError, Alert, inputClass } from '@/components/ui'

export function AcceptJobButton({ deliveryId }: { deliveryId: string }) {
  const [state, formAction, pending] = useActionState<DeliveryActionState, FormData>(
    acceptJobAction,
    {},
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Claiming…' : 'Accept delivery'}
      </button>
      {state.error && <p className="mt-1.5 text-xs text-coral-ink">{state.error}</p>}
    </form>
  )
}

export function PickUpButton({ deliveryId }: { deliveryId: string }) {
  const [state, formAction, pending] = useActionState<DeliveryActionState, FormData>(
    pickUpAction,
    {},
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'I have collected it'}
      </button>
      {state.error && <p className="mt-1.5 text-xs text-coral-ink">{state.error}</p>}
    </form>
  )
}

/**
 * Proof of delivery (SAD Logistics Engine). A free-text record of who received
 * the order — the minimum honest version of proof. A photo upload slots into
 * the same form once object storage is configured.
 */
export function CompleteDeliveryForm({ deliveryId }: { deliveryId: string }) {
  const [state, formAction, pending] = useActionState<DeliveryActionState, FormData>(
    completeDeliveryAction,
    {},
  )
  const [open, setOpen] = useState(false)

  if (state.notice) return <Alert tone="success">{state.notice}</Alert>

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600"
      >
        Mark delivered
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <label className="block text-sm font-medium text-ink" htmlFor={`proof-${deliveryId}`}>
        Who received it?
      </label>
      <input
        id={`proof-${deliveryId}`}
        name="proofNote"
        className={inputClass}
        placeholder="Name of the person who took the order"
        required
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Confirm delivery'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-brand border border-line px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  )
}
