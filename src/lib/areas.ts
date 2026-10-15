import { compassPoint, haversineKm, type LatLng } from '@/lib/geo'

/**
 * Turning coordinates back into a place a person recognises.
 *
 * Activity is aggregated into grid cells, and a cell centre is a pair of
 * decimals - useless on a dashboard. A shopkeeper reasons about "Ikeja" and
 * "3 km east of Yaba", so every cell is described relative to the nearest
 * named area we know about.
 *
 * Deliberately a lookup against a small table rather than a geocoding service:
 * it is instant, works offline, costs nothing per call, and the pilot is one
 * metropolitan area (BRS short-term objective). A real reverse-geocoder slots
 * in behind `describeArea` without touching a caller.
 */

export interface Area {
  label: string
  lat: number
  lng: number
}

/**
 * Where the MVP's first users actually are. The showcase names these when it
 * says where AfriMesh is piloting, so this list is the claim - keep it honest.
 */
export const PILOT_AREAS: Area[] = [
  { label: 'Jalingo, Taraba', lat: 8.8937, lng: 11.3596 },
  { label: 'Wukari, Taraba', lat: 7.8711, lng: 9.7779 },
  { label: 'Jimeta, Adamawa', lat: 9.2795, lng: 12.4584 },
  { label: 'Yola, Adamawa', lat: 9.2035, lng: 12.4954 },
]

/** Areas offered in the location picker, and the vocabulary for place names. */
export const KNOWN_AREAS: Area[] = [
  { label: 'Ikeja, Lagos', lat: 6.6018, lng: 3.3515 },
  { label: 'Yaba, Lagos', lat: 6.5095, lng: 3.3711 },
  { label: 'Surulere, Lagos', lat: 6.4969, lng: 3.3481 },
  { label: 'Lekki, Lagos', lat: 6.4478, lng: 3.4723 },
  { label: 'Apapa, Lagos', lat: 6.4491, lng: 3.3592 },
  { label: 'Wuse, Abuja', lat: 9.0765, lng: 7.4586 },
  { label: 'Sabon Gari, Kano', lat: 12.0022, lng: 8.5236 },
  { label: 'Port Harcourt', lat: 4.8156, lng: 7.0498 },
  ...PILOT_AREAS,
]

/** Within this, a point is simply *in* the area rather than near it. */
const INSIDE_KM = 3
/** Beyond this, naming the area would mislead more than it helps. */
const NEARBY_KM = 45

export function nearestArea(point: LatLng, areas: Area[] = KNOWN_AREAS) {
  let best: { area: Area; distanceKm: number } | null = null
  for (const area of areas) {
    const distanceKm = haversineKm(point, area)
    if (!best || distanceKm < best.distanceKm) best = { area, distanceKm }
  }
  return best
}

/**
 * The pilot area a point is in, or null when it is outside all of them. Close
 * enough to count is the same radius `describeArea` is willing to name.
 */
export function pilotAreaFor(point: LatLng): Area | null {
  const nearest = nearestArea(point, PILOT_AREAS)
  return nearest && nearest.distanceKm <= NEARBY_KM ? nearest.area : null
}

/**
 * A human name for a point: the area itself when it is close enough, its
 * direction and distance when it is not, and plain coordinates when nothing
 * known is within reach - which is honest rather than confidently wrong.
 */
export function describeArea(point: LatLng, areas: Area[] = KNOWN_AREAS): string {
  const nearest = nearestArea(point, areas)
  if (!nearest || nearest.distanceKm > NEARBY_KM) {
    return `${Math.abs(point.lat).toFixed(2)}°${point.lat >= 0 ? 'N' : 'S'}, ${Math.abs(
      point.lng,
    ).toFixed(2)}°${point.lng >= 0 ? 'E' : 'W'}`
  }
  if (nearest.distanceKm <= INSIDE_KM) return nearest.area.label

  return `${nearest.distanceKm.toFixed(0)} km ${compassPoint(nearest.area, point)} of ${
    nearest.area.label
  }`
}
