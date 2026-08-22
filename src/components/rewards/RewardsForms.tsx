'use client'

import { useActionState, useState } from 'react'
import { redeemPointsAction, type RewardsActionState } from '@/app/actions/rewards'
import { Alert, Field, inputClass } from '@/components/ui'

/**
 * The invitation card.
 *
 * The absolute share link is assembled at the moment it is copied, from the
 * origin the page is actually being served from. The app runs behind more than
 * one hostname, so a link built on the server would be wrong somewhere — and
 * resolving it during render would either mismatch on hydration or need an
 * effect to correct itself.
 */
export function InviteCard({ code, path = '/register' }: { code: string; path?: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const relative = `${path}?ref=${code}`

  async function copy(value: string, what: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard access can be refused; the value is on screen to be read.
      setCopied(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-brand border border-dashed border-accent-500/60 bg-accent-soft px-4 py-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Your invite code</p>
        <p className="mt-1 font-technical text-2xl font-bold tracking-[0.3em] text-accent-strong">
          {code}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(code, 'code')}
          className="flex-1 rounded-brand border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
        >
          {copied === 'code' ? 'Code copied' : 'Copy code'}
        </button>
        <button
          type="button"
          onClick={() => copy(`${window.location.origin}${relative}`, 'link')}
          className="flex-1 rounded-brand bg-accent-500 px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600"
        >
          {copied === 'link' ? 'Link copied' : 'Copy invite link'}
        </button>
      </div>

      <p className="break-all font-technical text-xs text-muted">{relative}</p>
    </div>
  )
}

/**
 * Points to cash. The balance and the floor are passed in rather than read
 * here, so the only thing this component decides is what the person typed.
 */
export function RedeemPointsForm({
  scope = 'user',
  balance,
  minimum,
  rateLabel,
}: {
  scope?: 'user' | 'organisation'
  balance: number
  minimum: number
  rateLabel: string
}) {
  const [state, formAction, pending] = useActionState<RewardsActionState, FormData>(
    redeemPointsAction,
    {},
  )
  const [points, setPoints] = useState(balance >= minimum ? String(balance) : '')

  const belowFloor = balance < minimum

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field
        label="Points to convert"
        hint={`${rateLabel} · minimum ${minimum.toLocaleString('en-NG')} points`}
        htmlFor="redeem-points"
      >
        <input
          id="redeem-points"
          name="points"
          type="number"
          min={minimum}
          max={balance}
          step={1}
          value={points}
          onChange={(event) => setPoints(event.target.value)}
          className={inputClass}
          disabled={belowFloor}
          required
        />
      </Field>

      <button
        type="submit"
        disabled={pending || belowFloor}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Converting…' : 'Convert to cash'}
      </button>

      {belowFloor && (
        <p className="text-xs text-muted">
          You need {(minimum - balance).toLocaleString('en-NG')} more points before you can convert.
        </p>
      )}
    </form>
  )
}
