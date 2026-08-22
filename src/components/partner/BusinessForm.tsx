'use client'

import { useActionState, useState } from 'react'
import {
  registerBusinessAction,
  updateBusinessAction,
  type OnboardingState,
} from '@/app/actions/onboarding'
import { Alert, Field, inputClass } from '@/components/ui'

/**
 * FUTURE-DASHBOARD: only the retail outlet tier is offered at launch.
 *
 * The upper supply tiers and the delivery partner are commented out rather
 * than removed — each still has a complete dashboard behind it. Restoring one
 * means uncommenting its entry here *and* its value in the `orgType` enum in
 * lib/forms.ts, which is what the server actually validates against.
 *
 * The outlet hint no longer mentions buying from merchants, because with that
 * tier switched off there is nobody upstream to buy from yet.
 */
const TYPES = [
  {
    value: 'outlet',
    label: 'Retail outlet',
    hint: 'A neighbourhood shop selling to consumers.',
  },
  // {
  //   value: 'merchant',
  //   label: 'Merchant / wholesaler',
  //   hint: 'You supply retail outlets in bulk and buy from dealer warehouses.',
  // },
  // {
  //   value: 'warehouse',
  //   label: 'Dealer warehouse',
  //   hint: 'A regional hub supplying merchants, sourcing from manufacturers.',
  // },
  // {
  //   value: 'manufacturer',
  //   label: 'Manufacturer',
  //   hint: 'You produce goods and supply dealer warehouses.',
  // },
  // {
  //   value: 'logistics',
  //   label: 'Delivery partner',
  //   hint: 'You move goods between participants in the network.',
  // },
] as const

/** Location capture. Distance decides who finds you, so it is not optional. */
function LocationField({
  lat,
  lng,
  setLat,
  setLng,
}: {
  lat: string
  lng: string
  setLat: (v: string) => void
  setLng: (v: string) => void
}) {
  const [status, setStatus] = useState<string | null>(null)

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">Business location</span>
      <div className="flex gap-2">
        <input
          name="lat"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Latitude"
          className={inputClass}
          required
        />
        <input
          name="lng"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Longitude"
          className={inputClass}
          required
        />
      </div>
      <button
        type="button"
        onClick={() => {
          if (!('geolocation' in navigator)) {
            setStatus('This device cannot share a location — enter the coordinates manually.')
            return
          }
          setStatus('Locating…')
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLat(pos.coords.latitude.toFixed(6))
              setLng(pos.coords.longitude.toFixed(6))
              setStatus('Location captured.')
            },
            () => setStatus('Permission denied — enter the coordinates manually.'),
          )
        }}
        className="mt-2 rounded-brand border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
      >
        Use my current location
      </button>
      <p className="mt-1 text-xs text-muted">
        {status ??
          'Buyers are matched to you by distance, so this must be where you actually trade.'}
      </p>
    </div>
  )
}

export function RegisterBusinessForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    registerBusinessAction,
    {},
  )
  const [type, setType] = useState<string>('outlet')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">
          What kind of business do you run?
        </legend>
        <div className="space-y-2">
          {TYPES.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-brand border px-3 py-2.5 ${
                type === option.value
                  ? 'border-accent-500 bg-accent-soft'
                  : 'border-line bg-surface'
              }`}
            >
              <input
                type="radio"
                name="type"
                value={option.value}
                checked={type === option.value}
                onChange={() => setType(option.value)}
                className="mt-0.5 accent-accent-500"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Business name" htmlFor="biz-name">
        <input id="biz-name" name="name" className={inputClass} required />
      </Field>

      <Field
        label="CAC registration number"
        hint="Optional now, required before you can withdraw."
        htmlFor="biz-rc"
      >
        <input
          id="biz-rc"
          name="registrationNumber"
          className={inputClass}
          placeholder="RC1234567"
        />
      </Field>

      <Field label="Street address" htmlFor="biz-address">
        <input id="biz-address" name="address" className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City" htmlFor="biz-city">
          <input id="biz-city" name="city" className={inputClass} defaultValue="Lagos" />
        </Field>
        <Field label="State" htmlFor="biz-state">
          <input id="biz-state" name="state" className={inputClass} defaultValue="Lagos" />
        </Field>
      </div>

      <Field label="Business phone" htmlFor="biz-phone">
        <input id="biz-phone" name="phone" type="tel" className={inputClass} />
      </Field>

      <LocationField lat={lat} lng={lng} setLat={setLat} setLng={setLng} />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Submitting…' : 'Submit for verification'}
      </button>

      <p className="text-xs text-muted">
        You can add inventory straight away. Your listings become discoverable to buyers once a
        platform administrator verifies the business — that verification is what the trust score and
        the &ldquo;verified&rdquo; badge are built on.
      </p>
    </form>
  )
}

export function EditBusinessForm({
  org,
}: {
  org: {
    name: string
    address: string | null
    city: string | null
    state: string | null
    lat: number
    lng: number
    delivery_radius_km: number
    avg_dispatch_minutes: number
  }
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    updateBusinessAction,
    {},
  )
  const [lat, setLat] = useState(String(org.lat))
  const [lng, setLng] = useState(String(org.lng))

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      <Field label="Business name" htmlFor="edit-name">
        <input id="edit-name" name="name" defaultValue={org.name} className={inputClass} />
      </Field>
      <Field label="Street address" htmlFor="edit-address">
        <input
          id="edit-address"
          name="address"
          defaultValue={org.address ?? ''}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" htmlFor="edit-city">
          <input id="edit-city" name="city" defaultValue={org.city ?? ''} className={inputClass} />
        </Field>
        <Field label="State" htmlFor="edit-state">
          <input
            id="edit-state"
            name="state"
            defaultValue={org.state ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Business phone" htmlFor="edit-phone">
        <input id="edit-phone" name="phone" type="tel" className={inputClass} />
      </Field>

      <LocationField lat={lat} lng={lng} setLat={setLat} setLng={setLng} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Delivery radius (km)" hint="How far you will serve" htmlFor="edit-radius">
          <input
            id="edit-radius"
            name="deliveryRadiusKm"
            type="number"
            min={1}
            defaultValue={org.delivery_radius_km}
            className={inputClass}
          />
        </Field>
        <Field
          label="Dispatch time (min)"
          hint="Feeds your delivery-time score"
          htmlFor="edit-dispatch"
        >
          <input
            id="edit-dispatch"
            name="avgDispatchMinutes"
            type="number"
            min={5}
            defaultValue={org.avg_dispatch_minutes}
            className={inputClass}
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
