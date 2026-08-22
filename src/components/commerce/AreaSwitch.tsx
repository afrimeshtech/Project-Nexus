'use client'

import { useTransition } from 'react'
import { setLocationAction } from '@/app/actions/session'

/**
 * Quick area switching, for a buyer standing where nothing is in stock.
 *
 * The location control lives in the header, which is the right home for it
 * when discovery is working. It is the wrong place when it is not: someone
 * looking at an empty marketplace has been told the problem is their area and
 * then has to go hunting for the control that changes it. The remedy belongs
 * next to the message.
 *
 * Deliberately a short list rather than the full picker — this is a way out of
 * a dead end, not a second navigation surface. The header picker still owns
 * GPS and the complete list.
 */
export function AreaSwitch({
  areas,
  current,
  limit = 4,
}: {
  areas: { label: string; lat: number; lng: number }[]
  /** Excluded from the list — offering the area they are already in is noise. */
  current: string
  limit?: number
}) {
  const [pending, startTransition] = useTransition()
  const choices = areas.filter((area) => area.label !== current).slice(0, limit)

  function pick(area: { label: string; lat: number; lng: number }) {
    const data = new FormData()
    data.set('lat', String(area.lat))
    data.set('lng', String(area.lng))
    data.set('label', area.label)
    data.set('source', 'chosen')
    startTransition(async () => {
      await setLocationAction(data)
    })
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {choices.map((area) => (
        <button
          key={area.label}
          type="button"
          disabled={pending}
          onClick={() => pick(area)}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent-500 hover:text-accent-strong disabled:opacity-60"
        >
          {area.label}
        </button>
      ))}
    </div>
  )
}
