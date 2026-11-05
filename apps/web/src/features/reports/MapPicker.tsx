import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, LatLngExpression, Map as LeafletMap } from 'leaflet'
import { Txt, useText } from '../../lib/i18n'
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
  // No pin is drawn until one is chosen: a pin at the map's default centre looks like a location that was set.
  const pin = useRef<CircleMarker | null>(null)
  const drop = useRef<(at: LatLngExpression) => void>(() => {})
  // Phones often reach the laptop over Wi-Fi with no internet, so the map's images may never arrive.
  const [broken, setBroken] = useState(false)
  useBoundaryLayer(leaflet)
  useEffect(() => {
    if (!element) return
    let alive = true
    let dispose = () => {}
    void import('leaflet')
      .then(L => {
        if (!alive) return
        const hasPin = latitude !== null && longitude !== null
        const center: [number, number] = [latitude ?? BARANGAY_CENTER[0], longitude ?? BARANGAY_CENTER[1]]
        const map = L.map(element, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(
          center,
          hasPin ? 16 : 12,
          { animate: false },
        )
        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        })
        tiles.on('tileerror', () => setBroken(true))
        tiles.on('tileload', () => setBroken(false))
        tiles.addTo(map)
        drop.current = at => {
          if (pin.current) {
            pin.current.setLatLng(at)
            return
          }
          pin.current = L.circleMarker(at, {
            radius: 10,
            color: '#ffffff',
            weight: 3,
            fillColor: '#1d64d8',
            fillOpacity: 1,
            className: 'pin-drop',
          }).addTo(map)
        }
        if (hasPin) drop.current(center)
        map.on('click', event => {
          drop.current(event.latlng)
          onPick(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)))
        })
        setLeaflet(map)
        dispose = () => {
          setLeaflet(null)
          pin.current = null
          map.stop()
          map.remove()
        }
      })
      .catch(() => {
        if (alive) setBroken(true)
      })
    return () => {
      alive = false
      dispose()
    }
    // Create a fresh map when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element])
  // A location from outside the map (Use GPS, the photo's GPS, typed coordinates) moves the pin and brings it into
  // view. A tap on the map already put the pin there, so it neither moves nor recentres.
  useEffect(() => {
    if (!leaflet || latitude === null || longitude === null) return
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    const at = pin.current?.getLatLng()
    if (at && Math.abs(at.lat - latitude) < 1e-5 && Math.abs(at.lng - longitude) < 1e-5) return
    drop.current([latitude, longitude])
    leaflet.setView([latitude, longitude], Math.max(leaflet.getZoom(), 16), { animate: false })
  }, [leaflet, latitude, longitude])
  const pinned = latitude !== null && longitude !== null
  return (
    <>
      <div
        ref={setElement}
        className="h-44 w-full xl:h-56"
        role="application"
        aria-label={t('Click the map to adjust the report pin')}
      />
      {(broken || !pinned) && (
        <p role="status" className="border-t-2 bg-card px-3 py-1.5 text-[13px] leading-snug font-bold">
          <Txt>
            {broken ? "Map can't load. Use GPS or enter the coordinates instead." : 'Tap the map to set the pin.'}
          </Txt>
        </p>
      )}
    </>
  )
}
