'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  adminReplySupportAction,
  replySupportAction,
  startSupportThreadAction,
  type SupportActionState,
} from '@/app/actions/support'
import { Field, FormError, inputClass } from '@/components/ui'

/** Starting a conversation with AfriMesh, for a signed-in member. */
export function NewSupportThreadForm({ source }: { source: 'consumer' | 'partner' }) {
  const [state, formAction, pending] = useActionState<SupportActionState, FormData>(
    startSupportThreadAction,
    {},
  )
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="source" value={source} />
      <FormError>{state.error}</FormError>
      <Field label="Subject" htmlFor="support-subject">
        <input
          id="support-subject"
          name="subject"
          maxLength={120}
          className={inputClass}
          placeholder={
            source === 'partner' ? 'e.g. Moving my shop, a payout' : 'e.g. A problem with an order'
          }
          required
        />
      </Field>
      <Field label="Message" htmlFor="support-body">
        <textarea
          id="support-body"
          name="body"
          rows={5}
          maxLength={2000}
          className={inputClass}
          placeholder="What can we help with?"
          required
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send to AfriMesh'}
      </button>
    </form>
  )
}

/**
 * Replying on a thread - the member's side or the administrator's, which
 * differ only in the action they post to. Clears itself once a reply lands.
 */
export function SupportReplyForm({
  threadId,
  admin = false,
}: {
  threadId: string
  admin?: boolean
}) {
  const [state, formAction, pending] = useActionState<SupportActionState, FormData>(
    admin ? adminReplySupportAction : replySupportAction,
    {},
  )
  const form = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)
  useEffect(() => {
    if (submitted.current && !pending && !state.error) form.current?.reset()
  }, [pending, state])

  return (
    <form
      ref={form}
      action={(fd) => {
        submitted.current = true
        formAction(fd)
      }}
      className="space-y-2"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <FormError>{state.error}</FormError>
      <label className="sr-only" htmlFor="support-reply">
        Your reply
      </label>
      <textarea
        id="support-reply"
        name="body"
        rows={3}
        maxLength={2000}
        className={inputClass}
        placeholder={admin ? 'Reply as AfriMesh support' : 'Write a reply'}
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send reply'}
      </button>
    </form>
  )
}
