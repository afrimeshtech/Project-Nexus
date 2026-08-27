'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  loginWithPasswordAction,
  registerAction,
  requestOtpAction,
  verifyOtpAction,
  type FormState,
} from '@/app/actions/session'
import { FormError, Alert, Field, inputClass } from '@/components/ui'

/**
 * Sign-in supports both methods the SAD lists for launch: email/password and
 * phone + OTP. Phone-first is deliberate - it is the identifier most Nigerian
 * shoppers and shopkeepers actually have and remember.
 */
export type Method = 'otp' | 'password'

const METHODS = [
  { key: 'otp', label: 'Phone + code' },
  { key: 'password', label: 'Password' },
] as const satisfies readonly { key: Method; label: string }[]

export function LoginForm({
  next = '/',
  referralCode = '',
  initialMethod = 'otp',
}: {
  next?: string
  /**
   * Carried from an invitation link. Phone + OTP creates the account on first
   * use, so someone can arrive on an invitation and never see the register
   * form at all — the code has to survive that route too.
   */
  referralCode?: string
  /**
   * Which method to open on, from `?method=` in the URL.
   *
   * This used to be client state only, which made password sign-in reachable
   * *exclusively* by clicking the tab. The form bodies stream in behind a
   * Suspense boundary, so until the reveal script runs the page shows two tabs
   * and nothing else — and a click that lands in that window does nothing.
   * There was also no address to link to, so "sign in with your password"
   * could not be sent to anyone. Now `/login?method=password` opens it
   * directly, and the tabs stay as the fast path once the page is live.
   */
  initialMethod?: Method
}) {
  const [tab, setTab] = useState<Method>(initialMethod)

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-4 flex rounded-brand bg-surface-muted p-1"
      >
        {METHODS.map((option, index) => (
          <button
            key={option.key}
            /* Without an explicit type a button inside a form submits it.
               These sit outside the form today, so it is latent rather than
               broken — but it is one refactor away from swallowing the tab
               click as a submit, which is exactly the reported symptom. */
            type="button"
            role="tab"
            id={`tab-${option.key}`}
            aria-selected={tab === option.key}
            aria-controls={`panel-${option.key}`}
            /* Roving tabindex: a tablist is one stop, arrows move within it. */
            tabIndex={tab === option.key ? 0 : -1}
            onClick={() => setTab(option.key)}
            onKeyDown={(event) => {
              const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (!delta) return
              event.preventDefault()
              const nextMethod = METHODS[(index + delta + METHODS.length) % METHODS.length]
              setTab(nextMethod.key)
              document.getElementById(`tab-${nextMethod.key}`)?.focus()
            }}
            className={`flex-1 rounded-[0.6rem] px-3 py-2 text-sm font-medium transition-colors ${
              tab === option.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'otp' ? (
          <OtpLogin next={next} referralCode={referralCode} />
        ) : (
          // No invite code on the password tab: an account with a password
          // already exists, so nobody is being introduced by signing into it.
          <PasswordLogin next={next} />
        )}
      </div>
    </div>
  )
}

function PasswordLogin({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginWithPasswordAction,
    {},
  )
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <FormError>{state.error}</FormError>

      <Field label="Phone or email" htmlFor="identifier">
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          className={inputClass}
          placeholder="08030000001 or you@example.ng"
          required
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          required
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function OtpLogin({ next, referralCode = '' }: { next: string; referralCode?: string }) {
  const [requestState, requestFormAction, requesting] = useActionState<FormState, FormData>(
    requestOtpAction,
    {},
  )
  const [verifyState, verifyFormAction, verifying] = useActionState<FormState, FormData>(
    verifyOtpAction,
    {},
  )
  const [phone, setPhone] = useState('')

  const codeSent = Boolean(requestState.notice)

  return (
    <div className="space-y-3">
      {requestState.error && <Alert tone="danger">{requestState.error}</Alert>}
      {verifyState.error && <Alert tone="danger">{verifyState.error}</Alert>}

      {referralCode && (
        <Alert tone="success">
          You were invited with code{' '}
          <strong className="font-technical">{referralCode.toUpperCase()}</strong>. If this is your
          first time here, whoever invited you earns once your first order completes.
        </Alert>
      )}

      {!codeSent ? (
        <form action={requestFormAction} className="space-y-3">
          <Field label="Phone number" hint="We will text you a 6-digit code." htmlFor="phone">
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="08030000001"
              required
            />
          </Field>
          <button
            type="submit"
            disabled={requesting}
            className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
          >
            {requesting ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form action={verifyFormAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="referralCode" value={referralCode} />
          <Alert tone="success">{requestState.notice}</Alert>
          {requestState.devCode && (
            <Alert tone="info">
              Development mode — no SMS provider is configured, so your code is{' '}
              <strong className="font-technical">{requestState.devCode}</strong>
            </Alert>
          )}
          <Field label="6-digit code" htmlFor="code">
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${inputClass} text-center font-technical text-lg tracking-[0.4em]`}
              required
            />
          </Field>
          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
          >
            {verifying ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
      )}
    </div>
  )
}

export function RegisterForm({
  next = '/',
  referralCode = '',
}: {
  next?: string
  /** Prefilled from ?ref= on an invitation link. */
  referralCode?: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(registerAction, {})

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <FormError>{state.error}</FormError>

      {referralCode && (
        <Alert tone="success">
          You were invited with code{' '}
          <strong className="font-technical">{referralCode.toUpperCase()}</strong>. Complete your
          first order and whoever invited you earns their reward.
        </Alert>
      )}

      <Field label="Full name" htmlFor="fullName">
        <input id="fullName" name="fullName" className={inputClass} autoComplete="name" required />
      </Field>
      <Field label="Phone number" htmlFor="reg-phone">
        <input
          id="reg-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className={inputClass}
          placeholder="08030000001"
        />
      </Field>
      <Field label="Email address" hint="Optional if you gave a phone number." htmlFor="reg-email">
        <input
          id="reg-email"
          name="email"
          type="email"
          autoComplete="email"
          className={inputClass}
        />
      </Field>
      <Field label="Password" hint="At least 8 characters." htmlFor="reg-password">
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          minLength={8}
        />
      </Field>
      <Field
        label="Invite code"
        hint="Optional. If someone invited you, enter their code so they get credited."
        htmlFor="reg-referral"
      >
        <input
          id="reg-referral"
          name="referralCode"
          defaultValue={referralCode.toUpperCase()}
          maxLength={24}
          autoCapitalize="characters"
          className={`${inputClass} font-technical uppercase tracking-widest`}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-muted">
        Already registered?{' '}
        <Link
          // The invitation travels with them: phone + OTP on the sign-in page
          // is also a sign-up, and dropping the code here would silently lose
          // the referral for anyone who takes that route.
          href={referralCode ? `/login?ref=${encodeURIComponent(referralCode)}` : '/login'}
          className="font-medium text-accent-strong hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  )
}
