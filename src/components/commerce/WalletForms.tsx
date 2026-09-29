'use client'

import { useActionState, useState } from 'react'
import { topUpAction, type WalletActionState } from '@/app/actions/wallet'
import {
  bankAccountAction,
  removeBankAccountAction,
  withdrawAction,
  type PayoutActionState,
} from '@/app/actions/payouts'
import type { Bank, BankAccount } from '@/modules/payouts/service'
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

type Scope = 'user' | 'organisation'

const maskAccount = (number: string) => `····${number.slice(-4)}`

/**
 * Withdraw to one of the saved, name-checked accounts. With none saved yet,
 * adding one is the first step, so the form leads with it.
 */
export function WithdrawForm({
  scope = 'user',
  accounts,
  banks,
}: {
  scope?: Scope
  accounts: BankAccount[]
  banks: Bank[]
}) {
  const [state, formAction, pending] = useActionState<PayoutActionState, FormData>(
    withdrawAction,
    {},
  )
  const [adding, setAdding] = useState(false)

  if (accounts.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Add the bank account you want withdrawals paid into. We check the account name with your
          bank before saving it.
        </p>
        <AddBankAccountForm scope={scope} banks={banks} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form key={state.notice ?? 'withdraw'} action={formAction} className="space-y-3">
        <input type="hidden" name="scope" value={scope} />
        <FormError>{state.error}</FormError>
        {state.notice && <Alert tone="success">{state.notice}</Alert>}

        <Field label="Send to" htmlFor="wd-account">
          <select
            id="wd-account"
            name="bankAccountId"
            className={inputClass}
            defaultValue={accounts[0].id}
            required
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name} · {account.bank_name} {maskAccount(account.account_number)}
              </option>
            ))}
          </select>
        </Field>

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
          {pending ? 'Sending…' : 'Withdraw to bank'}
        </button>
      </form>

      <div className="border-t border-line-soft pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          Saved accounts
        </p>
        <ul className="space-y-1.5">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-ink">{account.account_name}</span>
                <span className="block text-xs text-muted">
                  {account.bank_name} {maskAccount(account.account_number)}
                </span>
              </span>
              <RemoveBankAccountButton scope={scope} accountId={account.id} />
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="mt-3">
            <AddBankAccountForm scope={scope} banks={banks} onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 text-sm font-medium text-accent-strong hover:underline"
          >
            Add another account
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Two submits: the first looks the account up and shows the holder's name,
 * the second saves it. A payout to a mistyped number cannot be recalled, so
 * the person confirms the name the bank returned, not the digits they typed.
 */
export function AddBankAccountForm({
  scope = 'user',
  banks,
  onCancel,
}: {
  scope?: Scope
  banks: Bank[]
  onCancel?: () => void
}) {
  const [state, formAction, pending] = useActionState<PayoutActionState, FormData>(
    bankAccountAction,
    {},
  )

  if (state.notice) return <Alert tone="success">{state.notice}</Alert>

  if (state.preview) {
    const preview = state.preview
    return (
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="bankCode" value={preview.bankCode} />
        <input type="hidden" name="accountNumber" value={preview.accountNumber} />
        <input type="hidden" name="confirm" value="yes" />
        <FormError>{state.error}</FormError>
        <div className="rounded-brand border border-line-soft bg-surface-muted px-3 py-2.5">
          <p className="text-xs text-muted">Account name</p>
          <p className="font-semibold text-ink">{preview.accountName}</p>
          <p className="text-xs text-muted">
            {preview.bankName} · {preview.accountNumber}
          </p>
        </div>
        <p className="text-sm text-muted">Is this your account? Withdrawals will be paid here.</p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Yes, save account'}
          </button>
          <button
            type="button"
            // A full reload clears the looked-up account from the action state.
            onClick={() => window.location.assign(window.location.href)}
            className="rounded-brand border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            No, change
          </button>
        </div>
      </form>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      <FormError>{state.error}</FormError>
      <Field label="Bank" htmlFor={`bank-${scope}`}>
        <select
          id={`bank-${scope}`}
          name="bankCode"
          className={inputClass}
          defaultValue=""
          required
        >
          <option value="" disabled>
            Choose your bank
          </option>
          {banks.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Account number" htmlFor={`acct-${scope}`}>
        <input
          id={`acct-${scope}`}
          name="accountNumber"
          inputMode="numeric"
          pattern="\d{10}"
          maxLength={10}
          placeholder="10-digit NUBAN"
          className={inputClass}
          required
        />
      </Field>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? 'Checking…' : 'Check account'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-brand border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function RemoveBankAccountButton({ scope, accountId }: { scope: Scope; accountId: string }) {
  const [state, formAction, pending] = useActionState<PayoutActionState, FormData>(
    removeBankAccountAction,
    {},
  )
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 text-xs font-medium text-muted hover:text-coral-ink"
      >
        Remove
      </button>
    )
  }
  return (
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="accountId" value={accountId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-coral-ink disabled:opacity-60"
      >
        {pending ? 'Removing…' : 'Confirm remove'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted">
        Keep
      </button>
      {state.error && <span className="text-xs text-coral-ink">{state.error}</span>}
    </form>
  )
}
