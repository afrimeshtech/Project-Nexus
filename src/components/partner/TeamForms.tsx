'use client'

import { useActionState, useState } from 'react'
import { addSalesRepAction, removeTeamMemberAction, type TeamActionState } from '@/app/actions/team'
import { Alert, Button, Field, FormError, inputClass } from '@/components/ui'

export function AddSalesRepForm() {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(
    addSalesRepAction,
    {},
  )

  return (
    // Keyed on the notice so a successful add clears the fields for the next one.
    <form key={state.notice ?? 'form'} action={formAction} className="space-y-3">
      {state.notice && <Alert tone="success">{state.notice}</Alert>}
      <Field label="Name" htmlFor="rep-name">
        <input id="rep-name" name="fullName" className={inputClass} autoComplete="off" required />
      </Field>
      <Field
        label="Phone number"
        htmlFor="rep-phone"
        hint="They sign in with this number and a one-time code."
      >
        <input
          id="rep-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="0803 000 0000"
          className={inputClass}
          autoComplete="off"
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add sales rep'}
      </Button>
      <FormError>{state.error}</FormError>
    </form>
  )
}

/** Two steps, because removing someone ends their access immediately. */
export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(
    removeTeamMemberAction,
    {},
  )
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <span className="text-sm text-ink">Remove {name}?</span>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? 'Removing…' : 'Yes, remove'}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      <FormError>{state.error}</FormError>
    </form>
  )
}
