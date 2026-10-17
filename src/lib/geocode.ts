import 'server-only'

/**
 * Address -> coordinates, for locking a shop's location at registration.
 *
 * OpenStreetMap's Nominatim: free and keyless, which suits the MVP, with two
 * conditions that shape this module. Its usage policy asks for an identifying
 * User-Agent and at most one request a second, so calls are serialised and
 * spaced. And its coverage of Nigerian street addresses is patchy, so every
 * result says how precise it is: a town-level match is a pin in the town
 * centre, kilometres from the shop, and the caller must not lock a shop there.
 */

export type GeocodePrecision = 'exact' | 'street' | 'area' | 'town'

export interface GeocodeResult {
  lat: number
  lng: number
  label: string
  precision: GeocodePrecision
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'AfriMesh/1.0 (+https://afrimeshcommerce.com)'
const MIN_GAP_MS = 1100

const PRECISION: Record<string, GeocodePrecision> = {
  house: 'exact',
  building: 'exact',
  amenity: 'exact',
  shop: 'exact',
  office: 'exact',
  road: 'street',
  street: 'street',
  neighbourhood: 'area',
  quarter: 'area',
  suburb: 'area',
  hamlet: 'area',
}

let queue: Promise<unknown> = Promise.resolve()
let lastCall = 0

/** One request at a time, at least MIN_GAP_MS apart, across the process. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    return fn()
  })
  queue = run.catch(() => undefined)
  return run
}

async function search(query: string): Promise<GeocodeResult[]> {
  const url = `${ENDPOINT}?${new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'ng',
    limit: '3',
  })}`
  const res = await throttled(() =>
    fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8000),
    }),
  )
  if (!res.ok) throw new Error(`Geocoder answered ${res.status}`)
  const rows = (await res.json()) as {
    lat: string
    lon: string
    display_name: string
    addresstype?: string
    type?: string
  }[]
  return rows.map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lon),
    label: row.display_name,
    precision: PRECISION[row.addresstype ?? ''] ?? PRECISION[row.type ?? ''] ?? 'town',
  }))
}

/**
 * The best match for a shop address, most precise first. Returns null when
 * nothing in Nigeria matches; throws only when the service itself fails.
 */
export async function geocodeShopAddress(input: {
  street: string
  city: string
  state: string
}): Promise<GeocodeResult | null> {
  const query = [input.street, input.city, input.state, 'Nigeria'].filter(Boolean).join(', ')
  let results = await search(query)
  // Many Nigerian streets are not on OpenStreetMap at all, and a full address
  // with an unknown street matches nothing. Falling back to the town gives the
  // retailer a pin they can see is only the town - which the form refuses to
  // lock, steering them to GPS - rather than a bare "not found".
  if (!results.length && input.city) {
    results = (await search([input.city, input.state, 'Nigeria'].filter(Boolean).join(', '))).map(
      (r) => ({ ...r, precision: 'town' as const }),
    )
  }
  const order: GeocodePrecision[] = ['exact', 'street', 'area', 'town']
  results.sort((a, b) => order.indexOf(a.precision) - order.indexOf(b.precision))
  return results[0] ?? null
}
