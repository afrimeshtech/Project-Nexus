'use client'

import { useActionState, useState } from 'react'
import { checkoutAction, type CartActionState } from '@/app/actions/cart'
import { FormError, Field, inputClass } from '@/components/ui'
import { PAYMENT_METHOD_LABEL } from '@/lib/payment-labels'

/**
 * Checkout. Payment methods come from the PRD's launch list (wallet, bank
 * transfer, card, USSD, QR); the payment module abstracts the provider behind
 * them, so this form never changes when a real gateway is wired in.
 */
export function CheckoutForm({
  walletBalance,
  total,
  defaultAddress,
  pickupAvailable = true,
}: {
  walletBalance: number
  total: number
  defaultAddress: string
  pickupAvailable?: boolean
}) {
  const [state, formAction, pending] = useActionState<CartActionState, FormData>(checkoutAction, {})
  const [method, setMethod] = useState<string>(walletBalance >= total ? 'wallet' : 'card')
  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery')

  const walletShort = walletBalance < total

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">How do you want it?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['delivery', 'pickup'] as const).map((option) => {
            /*
             * `pointer-events-none` only stops a mouse. The radio underneath it
             * stayed focusable and arrow-selectable, so a keyboard user could
             * choose collection from a seller that does not offer it and submit
             * the order. Unavailability has to be on the control itself.
             */
            const unavailable = option === 'pickup' && !pickupAvailable
            return (
              <label
                key={option}
                className={`rounded-brand border px-3 py-2.5 text-sm ${
                  fulfilment === option
                    ? 'border-accent-500 bg-accent-soft font-semibold text-accent-strong'
                    : 'border-line bg-surface text-ink'
                } ${unavailable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="fulfilment"
                  value={option}
                  checked={fulfilment === option}
                  disabled={unavailable}
                  onChange={() => setFulfilment(option)}
                  className="sr-only"
                />
                {option === 'delivery' ? 'Deliver to me' : 'I will collect'}
                {unavailable && <span className="sr-only"> — not offered by this seller</span>}
              </label>
            )
          })}
        </div>
      </fieldset>

      {fulfilment === 'delivery' && (
        <Field label="Delivery address" htmlFor="address">
          <input
            id="address"
            name="address"
            defaultValue={defaultAddress}
            className={inputClass}
            placeholder="Street, area, landmark"
          />
        </Field>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Pay with</legend>
        <div className="space-y-2">
          {(Object.keys(PAYMENT_METHOD_LABEL) as (keyof typeof PAYMENT_METHOD_LABEL)[]).map(
            (key) => {
              const disabled = key === 'wallet' && walletShort
              return (
                <label
                  key={key}
                  className={`flex items-center justify-between gap-3 rounded-brand border px-3 py-2.5 text-sm ${
                    method === key ? 'border-accent-500 bg-accent-soft' : 'border-line bg-surface'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="method"
                      value={key}
                      checked={method === key}
                      disabled={disabled}
                      onChange={() => setMethod(key)}
                      className="accent-accent-500"
                    />
                    <span className="font-medium text-ink">{PAYMENT_METHOD_LABEL[key]}</span>
                  </span>
                  {key === 'wallet' && (
                    <span className="text-xs text-muted">
                      {walletShort ? 'Balance too low' : 'Instant'}
                    </span>
                  )}
                </label>
              )
            },
          )}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-3 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Placing your order…' : 'Place order and pay'}
      </button>

      <p className="text-center text-xs text-muted">
        Your payment is held in escrow and only released to the seller once the order is delivered.
      </p>
    </form>
  )
}
