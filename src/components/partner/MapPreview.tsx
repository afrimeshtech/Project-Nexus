/**
 * A small OpenStreetMap view with a pin, so a retailer sees exactly where
 * their shop is about to be locked - and later, where it is locked.
 *
 * The embed is OpenStreetMap's own, keyless and script-free on our side; the
 * box is about 400 m across, close enough to tell one street from the next.
 */
export function MapPreview({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const d = 0.002
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div className="overflow-hidden rounded-brand border border-line">
      <iframe
        title={label}
        src={src}
        loading="lazy"
        className="block h-48 w-full"
        referrerPolicy="no-referrer"
      />
      <p className="bg-surface-muted px-3 py-1.5 font-technical text-[11px] text-muted">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
    </div>
  )
}
