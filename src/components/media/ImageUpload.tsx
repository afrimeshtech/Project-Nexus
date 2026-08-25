'use client'

import { useActionState, useRef, useState } from 'react'
import {
  uploadProductImageAction,
  uploadOrgLogoAction,
  type MediaActionState,
} from '@/app/actions/media'
import { FormError, Alert } from '@/components/ui'

const MAX_MB = 2

/**
 * Image picker with a local preview.
 *
 * The preview is generated from the chosen file before it is sent, so on a
 * slow connection the person can see they picked the right photo rather than
 * waiting to find out. Client-side size and type checks are a courtesy only -
 * the server re-checks the actual bytes, because anything sent from a browser
 * can be forged.
 */
function Picker({
  action,
  hiddenFields,
  label,
  hint,
  currentUrl,
  shape = 'square',
  disabled,
  disabledReason,
}: {
  action: (state: MediaActionState, formData: FormData) => Promise<MediaActionState>
  hiddenFields?: Record<string, string>
  label: string
  hint?: string
  currentUrl?: string | null
  shape?: 'square' | 'circle'
  disabled?: boolean
  disabledReason?: string
}) {
  const [state, formAction, pending] = useActionState<MediaActionState, FormData>(action, {})
  const [preview, setPreview] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-brand'
  const shown = preview ?? currentUrl ?? null

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setLocalError(null)
    if (!file) {
      setPreview(null)
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`,
      )
      event.target.value = ''
      setPreview(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setLocalError('Choose an image file.')
      event.target.value = ''
      return
    }
    setPreview(URL.createObjectURL(file))
  }

  if (disabled) {
    return (
      <div className="flex items-center gap-3">
        <Thumbnail url={shown} rounded={rounded} />
        <p className="text-xs text-muted">{disabledReason}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="flex items-center gap-3">
        <Thumbnail url={shown} rounded={rounded} />

        <div className="min-w-0 flex-1">
          <label className="block">
            <span className="sr-only">{label}</span>
            <input
              ref={inputRef}
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={onPick}
              required
              className="block w-full text-xs text-muted file:mr-3 file:rounded-brand file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink hover:file:bg-surface-strong"
            />
          </label>
          {hint && !localError && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>

        <button
          type="submit"
          disabled={pending || !preview}
          className="shrink-0 rounded-brand bg-accent-500 px-3 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Save'}
        </button>
      </div>

      {localError && <p className="text-xs text-coral-ink">{localError}</p>}
      <FormError>{state.error}</FormError>
      {state.notice && <Alert tone="success">{state.notice}</Alert>}
    </form>
  )
}

function Thumbnail({ url, rounded }: { url: string | null; rounded: string }) {
  if (!url) {
    return (
      <span
        aria-hidden
        className={`grid h-14 w-14 shrink-0 place-items-center border border-dashed border-line text-lg text-muted ${rounded}`}
      >
        +
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`h-14 w-14 shrink-0 object-cover ${rounded}`} />
  )
}

export function ProductImageUpload({
  productId,
  currentUrl,
  canEdit,
  reason,
}: {
  productId: string
  currentUrl?: string | null
  canEdit: boolean
  reason?: string
}) {
  return (
    <Picker
      action={uploadProductImageAction}
      hiddenFields={{ productId }}
      label="Product photo"
      hint={`JPEG, PNG, WebP or AVIF · up to ${MAX_MB} MB`}
      currentUrl={currentUrl}
      disabled={!canEdit}
      disabledReason={reason}
    />
  )
}

export function LogoUpload({ currentUrl }: { currentUrl?: string | null }) {
  return (
    <Picker
      action={uploadOrgLogoAction}
      label="Business logo"
      hint={`Square works best · up to ${MAX_MB} MB`}
      currentUrl={currentUrl}
      shape="circle"
    />
  )
}
