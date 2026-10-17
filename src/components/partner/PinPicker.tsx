'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

export interface PinPosition {
  lat: number
  lng: number
  /** The map's zoom when the pin was last placed: 16+ is street level. */
  zoom: number
}

/**
 * A map with one pin the retailer drags onto their shop.
 *
 * For when an address lookup only finds the town: the pin starts on the
 * town, and the retailer zooms in and moves it onto the building. Tapping
 * the map moves the pin there too, which is easier than dragging on a phone.
 *
 * Leaflet is loaded in the browser only - it reads `window` on import - and
 * the pin is drawn in CSS rather than with Leaflet's default marker images,
 * which do not survive a bundler.
 */
export function PinPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number
  lng: number
  onChange: (position: PinPosition) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  // The latest callback, without re-creating the map every render.
  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false
    let teardown: (() => void) | undefined

    import('leaflet').then((L) => {
      if (cancelled || !el.current) return
      const map = L.map(el.current, { zoomControl: true }).setView([lat, lng], 14)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: '<span class="afm-pin" aria-hidden="true"></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      })
      const marker = L.marker([lat, lng], { draggable: true, icon, autoPan: true }).addTo(map)

      const emit = () => {
        const p = marker.getLatLng()
        report.current({
          lat: Number(p.lat.toFixed(6)),
          lng: Number(p.lng.toFixed(6)),
          zoom: map.getZoom(),
        })
      }
      marker.on('dragend', emit)
      map.on('zoomend', emit)
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng)
        emit()
      })
      emit()
      teardown = () => map.remove()
    })

    return () => {
      cancelled = true
      teardown?.()
    }
    // The map is created once per starting point; moves happen inside it.
  }, [lat, lng])

  return (
    <div
      ref={el}
      className="h-64 w-full overflow-hidden rounded-brand border border-line"
      role="application"
      aria-label="Map: drag the pin onto your shop"
    />
  )
}
