'use client'

import { useActionState, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  advanceOrderAction,
  cancelOrderAction,
  dispatchOrderAction,
  rateOrderAction,
  type OrderActionState,
} from '@/app/actions/orders'
import type { RiderOption } from '@/modules/logistics/service'
import { payOrderAction, type CartActionState } from '@/app/actions/cart'
import { FormError, Alert, inputClass } from '@/components/ui'
import { PAYMENT_METHOD_LABEL } from '@/lib/payment-labels'

export function AdvanceOrderButton({
  orderId,
  next,
  label,
  variant = 'primary',
}: {
  orderId: string
  next: string
  label: string
  variant?: 'primary' | 'secondary'
}) {
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(
    advanceOrderAction,
    {},
  )
  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-brand px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
          variant === 'primary'
            ? 'bg-accent-500 text-accent-ink hover:bg-accent-600'
            : 'border border-line bg-surface text-ink hover:bg-surface-muted'
        }`}
      >
        {pending ? 'Working…' : label}
      </button>
      {state.error && <p className="mt-1 text-xs text-coral-ink">{state.error}</p>}
    </form>
  )
}

/**
 * Dispatch to a named rider, or to the open board when none is chosen.
 * `assignOnly` is the already-dispatched case: the order has left the
 * preparing stage, and all that is missing is someone to carry it.
 */
export function DispatchForm({
  orderId,
  riders,
  assignOnly = false,
}: {
  orderId: string
  riders: RiderOption[]
  assignOnly?: boolean
}) {
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(
    dispatchOrderAction,
    {},
  )

  if (state.notice) return <Alert tone="success">{state.notice}</Alert>

  const fieldId = `rider-${orderId}`
  return (
    <form action={formAction} className="w-full space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block text-sm font-medium text-ink" htmlFor={fieldId}>
        {assignOnly ? 'Assign a rider' : 'Delivery rider'}
      </label>
      <select
        id={fieldId}
        name="riderId"
        defaultValue=""
        className={inputClass}
        required={assignOnly}
      >
        {assignOnly ? (
          <option value="" disabled>
            Choose a rider
          </option>
        ) : (
          <option value="">Open job board — first nearby rider to accept</option>
        )}
        {riders.map((rider) => (
          <option key={rider.user_id} value={rider.user_id}>
            {riderOptionLabel(rider)}
          </option>
        ))}
      </select>
      {riders.length === 0 && (
        <p className="text-xs text-muted">
          No riders near the shop yet.{' '}
          {assignOnly ? 'The job stays on the open board.' : 'It will go to the open job board.'}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (assignOnly && riders.length === 0)}
        className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Working…' : assignOnly ? 'Assign rider' : 'Dispatch'}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  )
}

function riderOptionLabel(rider: RiderOption): string {
  const facts = [
    rider.distance_km !== null ? `${Number(rider.distance_km).toFixed(1)} km away` : null,
    rider.deliveries_for_shop > 0
      ? `${rider.deliveries_for_shop} ${rider.deliveries_for_shop === 1 ? 'delivery' : 'deliveries'} for you`
      : null,
    rider.active_jobs > 0 ? `carrying ${rider.active_jobs}` : 'free',
  ].filter(Boolean)
  return `${rider.full_name} — ${facts.join(' · ')}`
}

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(
    cancelOrderAction,
    {},
  )
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-brand border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
      >
        Cancel order
      </button>
    )
  }

  return (
    <form action={formAction} className="w-full space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input name="reason" placeholder="Why are you cancelling?" className={inputClass} required />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-brand bg-coral-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Cancelling…' : 'Confirm cancellation'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-brand border border-line px-4 py-2 text-sm font-medium"
        >
          Keep order
        </button>
      </div>
      <FormError>{state.error}</FormError>
      <p className="text-xs text-muted">
        If the order was already paid, the full amount returns to your wallet and the stock goes
        back to the seller.
      </p>
    </form>
  )
}

export function RateOrderForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(
    rateOrderAction,
    {},
  )
  const [stars, setStars] = useState(5)

  if (state.notice) return <Alert tone="success">{state.notice}</Alert>

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="stars" value={stars} />

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">How was this seller?</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              onClick={() => setStars(value)}
              className={`transition-transform hover:scale-110 ${
                value <= stars ? 'text-accent-strong' : 'text-surface-strong'
              }`}
            >
              <Icon name={value <= stars ? 'star-filled' : 'star'} size={26} />
            </button>
          ))}
        </div>
      </div>

      <textarea
        name="comment"
        rows={2}
        placeholder="Anything other buyers should know? (optional)"
        className={inputClass}
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Submit rating'}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  )
}

export function RetryPaymentForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<CartActionState, FormData>(payOrderAction, {})
  const [method, setMethod] = useState('wallet')

  if (state.notice) return <Alert tone="success">{state.notice}</Alert>

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block text-sm font-medium text-ink" htmlFor="retry-method">
        Pay with
      </label>
      <select
        id="retry-method"
        name="method"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        className={inputClass}
      >
        {Object.entries(PAYMENT_METHOD_LABEL).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Processing…' : 'Complete payment'}
      </button>
      <FormError>{state.error}</FormError>
      <p className="text-xs text-muted">
        Stock stays reserved for a short window. If payment is not completed, the reservation is
        released and the items go back on sale.
      </p>
    </form>
  )
}
