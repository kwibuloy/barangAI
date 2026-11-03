import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GeoJsonObject } from 'geojson'
import type { Map as LeafletMap } from 'leaflet'
import { api } from '../../lib/api'
import { useTheme } from '../../lib/theme'

type Boundaries = GeoJsonObject & { features?: unknown[] }

/** Borders hardly ever change, and the API lets the browser keep them for the same hour. */
export function useBoundaries() {
  return useQuery({
    queryKey: ['barangay-boundaries'],
    queryFn: () => api<Boundaries>('/barangays/boundaries'),
    staleTime: 60 * 60 * 1000,
  })
}

/** Draws barangay borders under a map's pins. Clicks pass through, so picking a pin or a spot works as before. */
export function useBoundaryLayer(map: LeafletMap | null) {
  const { data } = useBoundaries()
  const { dark } = useTheme()
  useEffect(() => {
    if (!map || !data?.features?.length) return
    let alive = true
    let remove = () => {}
    void import('leaflet').then(L => {
      if (!alive) return
      const layer = L.geoJSON(data, {
        interactive: false,
        attribution:
          'Boundaries: NAMRIA, PSA, via OCHA (<a href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noopener noreferrer">CC BY-IGO</a>), simplified',
        style: { color: dark ? '#8ab8ff' : '#1d64d8', weight: 1.5, opacity: 0.7, dashArray: '4 3', fill: false },
      }).addTo(map)
      layer.bringToBack()
      remove = () => layer.remove()
    })
    return () => {
      alive = false
      remove()
    }
  }, [map, data, dark])
}
