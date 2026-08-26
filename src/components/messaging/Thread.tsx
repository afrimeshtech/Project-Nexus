'use client'

import { useActionState, useEffect, useRef } from 'react'
import { sendMessageAction, type MessageActionState } from '@/app/actions/messaging'
import { FormError } from '@/components/ui'
import type { Message } from '@/modules/messaging/service'

export function Thread({
  orderId,
  messages,
  side,
  counterpartName,
}: {
  orderId: string
  messages: Message[]
  side: 'buyer' | 'seller'
  counterpartName: string
}) {
  const [state, formAction, pending] = useActionState<MessageActionState, FormData>(
    sendMessageAction,
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset()
  }, [pending, state.error])

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[26rem] space-y-2 overflow-y-auto rounded-brand bg-surface p-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No messages yet. Ask {counterpartName} anything about this order.
          </p>
        )}
        {messages.map((message) => {
          const mine = message.sender_side === side
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-brand px-3 py-2 ${
                  mine
                    ? 'bg-accent-500 text-accent-ink'
                    : 'border border-line-soft bg-surface text-ink'
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                <p className={`mt-0.5 text-[11.2px] ${mine ? 'text-white/70' : 'text-muted'}`}>
                  {new Date(message.created_at).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <FormError>{state.error}</FormError>

      <form ref={formRef} action={formAction} className="flex items-end gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        <label className="sr-only" htmlFor="message-body">
          Message
        </label>
        <textarea
          id="message-body"
          name="body"
          rows={2}
          maxLength={2000}
          required
          placeholder={`Message ${counterpartName}…`}
          className="min-h-11 flex-1 resize-none rounded-brand border border-line bg-field px-3 py-2.5 text-sm text-field-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
