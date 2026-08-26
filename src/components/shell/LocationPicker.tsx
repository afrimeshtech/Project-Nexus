'use client'

import { useState, useTransition } from 'react'
import { Icon } from '@/components/Icon'
import { setLocationAction } from '@/app/actions/session'

/**
 * Location control. Uses the browser Geolocation API when the user allows it
 * and falls back to a list of areas otherwise, because "GPS/location services
 * are available" is an assumption in the BRS, not a guarantee - and a denied
 * permission prompt must not leave someone unable to shop.
 */
export function LocationPicker({
  label,
  areas,
}: {
  label: string
  areas: { label: string; lat: number; lng: number }[]
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function apply(lat: number, lng: number, name: string, source: string) {
    const data = new FormData()
    data.set('lat', String(lat))
    data.set('lng', String(lng))
    data.set('label', name)
    data.set('source', source)
    startTransition(async () => {
      await setLocationAction(data)
      setOpen(false)
      setStatus(null)
    })
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setStatus('This device cannot share a location. Pick an area instead.')
      return
    }
    setStatus('Finding you…')
    navigator.geolocation.getCurrentPosition(
      (pos) => apply(pos.coords.latitude, pos.coords.longitude, 'Current location', 'gps'),
      () => setStatus('Location permission denied. Pick an area instead.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 max-w-[13rem] items-center gap-1.5 rounded-brand px-2 py-1.5 text-left text-sm text-bar-ink transition-colors hover:bg-bar-line/60"
      >
        <Icon name="pin" size={16} />
        <span className="truncate font-medium">{label}</span>
        <span aria-hidden className="text-bar-muted">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-72 rounded-brand border border-line-soft bg-surface p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Deliver to</p>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={pending}
            className="mb-2 w-full rounded-brand bg-accent-500 px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
          >
            Use my current location
          </button>
          {status && <p className="mb-2 text-xs text-muted">{status}</p>}
          <div className="max-h-56 overflow-y-auto">
            {areas.map((area) => (
              <button
                key={area.label}
                type="button"
                disabled={pending}
                onClick={() => apply(area.lat, area.lng, area.label, 'chosen')}
                className="block w-full rounded px-2 py-2 text-left text-sm text-ink hover:bg-surface-muted disabled:opacity-60"
              >
                {area.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
