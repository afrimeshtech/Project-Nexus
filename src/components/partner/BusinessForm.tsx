'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import {
  geocodeShopAddressAction,
  registerBusinessAction,
  updateBusinessAction,
  type OnboardingState,
} from '@/app/actions/onboarding'
import { FormError, Alert, Field, inputClass } from '@/components/ui'
import { MapPreview } from '@/components/partner/MapPreview'
import { PinPicker, type PinPosition } from '@/components/partner/PinPicker'
import { haversineKm } from '@/lib/geo'

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

/** A GPS fix rougher than this could put the shop on the wrong street. */
const MAX_GPS_ACCURACY_M = 150
/** Street level: a hand-placed pin is only accepted once zoomed in this far. */
const MIN_PIN_ZOOM = 16
/** A hand-placed pin must stay this close to the town the address found. */
const MAX_PIN_DRIFT_KM = 25

interface Spot {
  lat: number
  lng: number
  /** 'pin' is a hand-placed pin, for an address the map only knows by town. */
  source: 'gps' | 'address' | 'pin'
  /** What was found - an accuracy for GPS, the matched place for an address. */
  detail: string
  /** Whether it is precise enough to lock a shop to. */
  lockable: boolean
  /** Why not, when it is not. */
  problem?: string
}

/**
 * Locking the shop's location.
 *
 * Distance decides which buyers find a shop, so the location is pinned once,
 * at registration, from one of two trustworthy sources: the device's GPS
 * while standing in the shop, or the shop's street address looked up on the
 * map. Either way the retailer sees the pin before locking it, and raw
 * coordinates are never typed. Where the map only knows the town, not the
 * street, the retailer drags a pin from the town onto their shop instead -
 * accepted once zoomed to street level and still near that town. After registration it does not move - only
 * an administrator can relocate a shop.
 */
function ShopLocationLock({
  address,
  city,
  state,
  locked,
  setLocked,
}: {
  address: string
  city: string
  state: string
  locked: Spot | null
  setLocked: (spot: Spot | null) => void
}) {
  const [mode, setMode] = useState<'gps' | 'address'>('gps')
  const [candidate, setCandidate] = useState<Spot | null>(null)
  // A town- or area-level match: the pin starts here and the retailer moves it.
  const [anchor, setAnchor] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [pin, setPin] = useState<PinPosition | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, startLookup] = useTransition()

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setStatus('This device cannot share its location. Find the shop by address instead.')
      return
    }
    setCandidate(null)
    setStatus('Finding your position. Stand inside or right outside the shop.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = Math.round(pos.coords.accuracy)
        const lockable = accuracy <= MAX_GPS_ACCURACY_M
        setCandidate({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          source: 'gps',
          detail: `GPS, accurate to about ${accuracy} m`,
          lockable,
          problem: lockable
            ? undefined
            : `The GPS fix is too rough (about ${accuracy} m). Step outside or near a window, wait a moment, and try again.`,
        })
        setStatus(null)
      },
      () =>
        setStatus(
          'Location permission was refused. Allow it in your browser, or find the shop by address.',
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }

  const lookUp = () => {
    setCandidate(null)
    setAnchor(null)
    setPin(null)
    setStatus('Looking the address up on the map...')
    startLookup(async () => {
      const res = await geocodeShopAddressAction({ address, city, state })
      if (!res.result) {
        setStatus(res.error ?? 'We could not find that address.')
        return
      }
      const { precision } = res.result
      if (precision === 'exact' || precision === 'street') {
        setCandidate({
          lat: res.result.lat,
          lng: res.result.lng,
          source: 'address',
          detail: res.result.label,
          lockable: true,
        })
      } else {
        // Only the town or area is known: hand the retailer a pin to place.
        setAnchor({ lat: res.result.lat, lng: res.result.lng, label: res.result.label })
      }
      setStatus(null)
    })
  }

  if (locked) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">Shop location</span>
        <div className="space-y-2 rounded-brand border border-success/40 bg-success/10 p-3">
          <p className="text-sm font-medium text-success-ink">Location locked</p>
          <MapPreview lat={locked.lat} lng={locked.lng} label="Your locked shop location" />
          <p className="text-xs text-muted">{locked.detail}</p>
          <button
            type="button"
            onClick={() => {
              setLocked(null)
              setCandidate(null)
              setAnchor(null)
              setPin(null)
            }}
            className="rounded-brand border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            Change before submitting
          </button>
        </div>
        <input type="hidden" name="lat" value={locked.lat} />
        <input type="hidden" name="lng" value={locked.lng} />
        <input type="hidden" name="locationSource" value={locked.source} />
      </div>
    )
  }

  const tab = (value: 'gps' | 'address', label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => {
        setMode(value)
        setCandidate(null)
        setAnchor(null)
        setPin(null)
        setStatus(null)
      }}
      className={`flex-1 rounded-brand px-3 py-2 text-xs font-medium ${
        mode === value ? 'bg-surface text-ink shadow-subtle' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-ink">Lock your shop location</span>
      <p className="mb-2 text-xs text-muted">
        Buyers are matched to your shop by distance, so this is fixed once you register. Only
        AfriMesh can move it later.
      </p>
      <div className="flex gap-1 rounded-brand bg-surface-muted p-1">
        {tab('gps', 'Use my phone GPS')}
        {tab('address', 'Find by address')}
      </div>

      <div className="mt-2 space-y-2">
        {mode === 'gps' ? (
          <button
            type="button"
            onClick={locate}
            className="w-full rounded-brand border border-line px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            Get my position (I am at the shop)
          </button>
        ) : (
          <button
            type="button"
            onClick={lookUp}
            disabled={busy}
            className="w-full rounded-brand border border-line px-3 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
          >
            {busy ? 'Looking up...' : 'Find the address above on the map'}
          </button>
        )}

        {status && <p className="text-xs text-muted">{status}</p>}

        {anchor && (
          <PinPlacement
            anchor={anchor}
            pin={pin}
            setPin={setPin}
            onLock={(spot) => setLocked(spot)}
          />
        )}

        {candidate && (
          <div className="space-y-2">
            <MapPreview lat={candidate.lat} lng={candidate.lng} label="Proposed shop location" />
            <p className="text-xs text-muted">{candidate.detail}</p>
            {candidate.lockable ? (
              <button
                type="button"
                onClick={() => setLocked(candidate)}
                className="w-full rounded-brand bg-brand-deep px-3 py-2 text-sm font-semibold text-white"
              >
                Lock this location
              </button>
            ) : (
              <p className="rounded-brand bg-warning/15 px-3 py-2 text-xs text-warning-ink">
                {candidate.problem}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Placing the pin by hand, for an address the map knows only by town. The
 * pin starts on the town; the retailer zooms in and drags or taps it onto
 * their shop. It locks only at street level and within reach of that town,
 * so a careless tap cannot put a Jimeta shop in another state.
 */
function PinPlacement({
  anchor,
  pin,
  setPin,
  onLock,
}: {
  anchor: { lat: number; lng: number; label: string }
  pin: PinPosition | null
  setPin: (pin: PinPosition) => void
  onLock: (spot: Spot) => void
}) {
  const drift = pin ? haversineKm(anchor, pin) : 0
  const problem = !pin
    ? null
    : drift > MAX_PIN_DRIFT_KM
      ? `That is ${Math.round(drift)} km from ${anchor.label.split(',')[0]}. Check the address, or use GPS in the shop.`
      : pin.zoom < MIN_PIN_ZOOM
        ? 'Zoom in to street level (pinch, or the + button), then put the pin on your shop.'
        : null

  return (
    <div className="space-y-2">
      <p className="rounded-brand bg-warning/15 px-3 py-2 text-xs text-warning-ink">
        The map knows this town but not your street. Drag the pin, or tap the map, to put it exactly
        on your shop.
      </p>
      <PinPicker lat={anchor.lat} lng={anchor.lng} onChange={setPin} />
      {problem ? (
        <p className="text-xs text-muted">{problem}</p>
      ) : (
        pin && (
          <button
            type="button"
            onClick={() =>
              onLock({
                lat: pin.lat,
                lng: pin.lng,
                source: 'pin',
                detail: `Pin placed by hand near ${anchor.label.split(',')[0]}`,
                lockable: true,
              })
            }
            className="w-full rounded-brand bg-brand-deep px-3 py-2 text-sm font-semibold text-white"
          >
            Lock this location
          </button>
        )
      )}
    </div>
  )
}

/** The location after registration: shown, never edited by the retailer. */
function LockedLocation({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">Shop location</span>
      <MapPreview lat={lat} lng={lng} label="Your shop location" />
      <p className="mt-1 text-xs text-muted">
        Locked at registration, because buyers are matched to you by distance. Moved premises?{' '}
        <Link href="/partner/support" className="font-medium text-accent-strong underline">
          Contact us to move your shop
        </Link>
        .
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
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [locked, setLocked] = useState<Spot | null>(null)

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>

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

      <Field label="Shop street address" htmlFor="biz-address">
        <input
          id="biz-address"
          name="address"
          className={inputClass}
          placeholder="e.g. 14 Mubi Road"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City or town" htmlFor="biz-city">
          <input
            id="biz-city"
            name="city"
            className={inputClass}
            placeholder="e.g. Jimeta"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
          />
        </Field>
        <Field label="State" htmlFor="biz-state">
          <input
            id="biz-state"
            name="state"
            className={inputClass}
            placeholder="e.g. Adamawa"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            required
          />
        </Field>
      </div>

      <Field label="Business phone" htmlFor="biz-phone">
        <input id="biz-phone" name="phone" type="tel" className={inputClass} />
      </Field>

      <ShopLocationLock
        address={address}
        city={city}
        state={region}
        locked={locked}
        setLocked={setLocked}
      />

      <button
        type="submit"
        disabled={pending || !locked}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Submitting…' : 'Submit for verification'}
      </button>
      {!locked && (
        <p className="-mt-2 text-center text-xs text-muted">Lock your shop location to submit.</p>
      )}

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
  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>
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

      <LockedLocation lat={org.lat} lng={org.lng} />

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
          hint="How long you usually take to get an order ready"
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
