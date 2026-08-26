'use client'

import { useActionState } from 'react'
import { submitContactAction, type ContactFormState } from '@/app/actions/contact'
import { Field, FormError, inputClass } from '@/components/ui'

/**
 * One form, reachable from every shell (consumer, partner, the pre-login
 * showcase) via a plain link to `/contact` — see ConsumerShell's HeaderMenu,
 * PartnerShell's header, and the showcase nav. `source` records which one
 * sent the visitor here, without needing three different forms.
 */
export function ContactForm({
  source,
  defaultName = '',
  defaultEmail = '',
}: {
  source: 'consumer' | 'partner' | 'showcase'
  defaultName?: string
  defaultEmail?: string
}) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    submitContactAction,
    {},
  )

  if (state.notice) {
    return (
      <div
        role="status"
        className="rounded-brand border border-line bg-surface-muted px-4 py-6 text-center text-sm text-ink"
      >
        {state.notice}
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="source" value={source} />
      <FormError>{state.error}</FormError>

      <Field label="Your name" htmlFor="contact-name">
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          defaultValue={defaultName}
          className={inputClass}
          required
        />
      </Field>

      <Field label="Email" htmlFor="contact-email">
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          className={inputClass}
          required
        />
      </Field>

      <Field label="Message" htmlFor="contact-message">
        <textarea
          id="contact-message"
          name="message"
          rows={5}
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
        {pending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
