import { useEffect, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { useText } from '../../lib/i18n'
import { useBoundaryLayer } from './boundaries'

export const BARANGAY_CENTER: [number, number] = [14.3269, 120.9364]

export function MapPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null
  longitude: number | null
  onPick: (lat: number, lng: number) => void
}) {
  const t = useText()
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [leaflet, setLeaflet] = useState<LeafletMap | null>(null)
  useBoundaryLayer(leaflet)
  useEffect(() => {
    if (!element) return
    let alive = true
    let dispose = () => {}
    void import('leaflet').then(L => {
      if (!alive) return
      const center: [number, number] = [latitude ?? BARANGAY_CENTER[0], longitude ?? BARANGAY_CENTER[1]]
      const map = L.map(element, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(
        center,
        latitude === null ? 12 : 16,
        { animate: false },
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      const pin = L.circleMarker(center, {
        radius: 10,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1d64d8',
        fillOpacity: 1,
        className: 'pin-drop',
      }).addTo(map)
      map.on('click', event => {
        pin.setLatLng(event.latlng)
        onPick(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)))
      })
      setLeaflet(map)
      dispose = () => {
        setLeaflet(null)
        map.stop()
        map.remove()
      }
    })
    return () => {
      alive = false
      dispose()
    }
    // Create a fresh map when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element])
  return (
    <div
      ref={setElement}
      className="h-44 w-full xl:h-56"
      role="application"
      aria-label={t('Click the map to adjust the report pin')}
    />
  )
}
