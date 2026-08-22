'use client'

import { useActionState, useState } from 'react'
import { issueKeyAction, revokeKeyAction, type ApiKeyActionState } from '@/app/actions/api-keys'
import { Alert, Field, inputClass } from '@/components/ui'

/**
 * Issuing a key. The secret comes back once and is never retrievable again, so
 * the form makes that unmissable rather than printing it like any other field
 * and letting someone navigate away from it.
 */
export function IssueKeyForm({ scopes }: { scopes: { value: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ApiKeyActionState, FormData>(
    issueKeyAction,
    {},
  )
  const [copied, setCopied] = useState(false)

  async function copy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (state.secret) {
    return (
      <div className="space-y-3">
        <Alert tone="warning">
          This is the only time this key will be shown. Store it in your secret manager now — if you
          lose it, issue a new one and revoke this.
        </Alert>
        <p className="break-all rounded-brand border border-line bg-surface-muted p-3 font-technical text-sm text-ink">
          {state.secret}
        </p>
        <button
          type="button"
          onClick={() => copy(state.secret!)}
          className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600"
        >
          {copied ? 'Copied' : 'Copy key'}
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field
        label="What is this key for?"
        hint="Shown in your key list and in audit logs."
        htmlFor="key-name"
      >
        <input
          id="key-name"
          name="name"
          className={inputClass}
          placeholder="Stock sync — warehouse ERP"
          maxLength={80}
          required
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-ink">Scopes</legend>
        <p className="mb-2 text-xs text-muted">
          Grant only what this integration needs. A key with no scopes can read nothing.
        </p>
        <div className="space-y-1.5">
          {scopes.map((scope) => (
            <label key={scope.value} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="scopes"
                value={scope.value}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="block font-technical text-xs text-ink">{scope.value}</span>
                <span className="block text-xs text-muted">{scope.label}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create key'}
      </button>
    </form>
  )
}

export function RevokeKeyButton({ keyId }: { keyId: string }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium text-coral-ink hover:bg-coral/15"
      >
        Revoke
      </button>
    )
  }

  return (
    <form action={revokeKeyAction} className="flex items-center gap-2">
      <input type="hidden" name="keyId" value={keyId} />
      <span className="text-xs text-muted">Stops working immediately.</span>
      <button
        type="submit"
        className="rounded-brand bg-coral-strong px-3 py-1.5 text-xs font-semibold text-white"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium"
      >
        Cancel
      </button>
    </form>
  )
}
