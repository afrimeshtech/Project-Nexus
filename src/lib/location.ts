import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { currentUser } from '@/lib/auth'

/**
 * Where the buyer is standing. Everything the platform recommends is relative
 * to this point, so it is resolved once per request and passed down.
 *
 * Resolution order:
 *   1. the location cookie, set by the browser's Geolocation API or by the
 *      user picking a place;
 *   2. the address saved on their account;
 *   3. a sensible default so a first-time, not-signed-in visitor still sees a
 *      working marketplace rather than an empty page.
 *
 * "Offline Resilience" (PRD Core Principles): a denied or unavailable GPS fix
 * degrades to a chosen area instead of breaking discovery.
 */

export const LOCATION_COOKIE = 'afrimesh_loc'

export interface BuyerLocation {
  lat: number
  lng: number
  label: string
  source: 'gps' | 'saved' | 'chosen' | 'default'
}

/**
 * Launch market: Yola, the pilot town (see PILOT_AREAS in lib/areas) where the
 * first real verified sellers are, so a visitor with no location yet lands on
 * live stock rather than an empty marketplace.
 */
export const DEFAULT_LOCATION: BuyerLocation = {
  lat: 9.2035,
  lng: 12.4954,
  label: 'Yola, Adamawa',
  source: 'default',
}

/**
 * Areas offered in the location picker. They live in `lib/areas` because the
 * territory analytics name places from the same list, and that code runs where
 * this module's `server-only` cookie access cannot follow.
 */
export { KNOWN_AREAS } from '@/lib/areas'

export const buyerLocation = cache(async (): Promise<BuyerLocation> => {
  const jar = await cookies()
  const raw = jar.get(LOCATION_COOKIE)?.value

  if (raw) {
    const [lat, lng, source, ...label] = raw.split('|')
    const parsedLat = Number(lat)
    const parsedLng = Number(lng)
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
      return {
        lat: parsedLat,
        lng: parsedLng,
        label: label.join('|') || 'Current location',
        source: (source as BuyerLocation['source']) ?? 'chosen',
      }
    }
  }

  const user = await currentUser()
  if (user?.default_lat != null && user?.default_lng != null) {
    return {
      lat: user.default_lat,
      lng: user.default_lng,
      label:
        user.default_address ||
        [user.city, user.state].filter(Boolean).join(', ') ||
        'Saved address',
      source: 'saved',
    }
  }

  return DEFAULT_LOCATION
})

export function encodeLocation(loc: BuyerLocation): string {
  return `${loc.lat}|${loc.lng}|${loc.source}|${loc.label}`
}
