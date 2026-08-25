'use client'

import { useActionState } from 'react'
import { topUpAction, withdrawAction, type WalletActionState } from '@/app/actions/wallet'
import { FormError, Alert, Field, inputClass } from '@/components/ui'
import { PAYMENT_METHOD_LABEL } from '@/lib/payment-labels'

export function TopUpForm({ scope = 'user' }: { scope?: 'user' | 'organisation' }) {
  const [state, formAction, pending] = useActionState<WalletActionState, FormData>(topUpAction, {})

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      <FormError>{state.error}</FormError>
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field label="Amount (₦)" htmlFor="topup-amount">
        <input
          id="topup-amount"
          name="amount"
          type="number"
          min={100}
          step={100}
          placeholder="5000"
          className={inputClass}
          required
        />
      </Field>

      <Field label="Fund with" htmlFor="topup-method">
        <select id="topup-method" name="method" className={inputClass} defaultValue="card">
          {(['card', 'bank_transfer', 'ussd', 'qr'] as const).map((key) => (
            <option key={key} value={key}>
              {PAYMENT_METHOD_LABEL[key]}
            </option>
          ))}
        </select>
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Processing…' : 'Add money'}
      </button>
    </form>
  )
}

export function WithdrawForm({ scope = 'user' }: { scope?: 'user' | 'organisation' }) {
  const [state, formAction, pending] = useActionState<WalletActionState, FormData>(
    withdrawAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      <FormError>{state.error}</FormError>
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field
        label="Amount (₦)"
        hint="Escrow balances cannot be withdrawn until delivery is confirmed."
        htmlFor="wd-amount"
      >
        <input
          id="wd-amount"
          name="amount"
          type="number"
          min={100}
          step={100}
          className={inputClass}
          required
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
      >
        {pending ? 'Processing…' : 'Withdraw to bank'}
      </button>
    </form>
  )
}
