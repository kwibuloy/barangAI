import { useEffect, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { cn } from '@/lib/utils'
import { useTheme } from '../../lib/theme'
import { useText } from '../../lib/i18n'
import { useBoundaryLayer } from '../reports/boundaries'
import { label } from '../reports/categories'
import { BARANGAY_CENTER } from '../reports/MapPicker'
import { STATUS_STYLE } from '../reports/StatusBadge'
import type { Report } from '../reports/types'

/** What a pin needs: reports for staff, grouped cases on the residents' shared map. */
export type Pin = Pick<Report, 'id' | 'status' | 'resident_category' | 'latitude' | 'longitude'>

/** Pins coloured by status (the legend beside each map names them); clicking one opens it. */
export function StaffMap<T extends Pin>({
  reports,
  onSelect,
  className,
}: {
  reports: T[]
  onSelect?: (report: T) => void
  className?: string
}) {
  const t = useText()
  const { dark } = useTheme()
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [leaflet, setLeaflet] = useState<LeafletMap | null>(null)
  useBoundaryLayer(leaflet)
  useEffect(() => {
    if (!element) return
    let alive = true
    let dispose = () => {}
    void import('leaflet').then(L => {
      if (!alive) return
      const css = getComputedStyle(element)
      const colour = (status: Report['status']) =>
        css.getPropertyValue(STATUS_STYLE[status].color.slice(4, -1)).trim() || '#1d64d8'
      const points = reports.filter(report => Number.isFinite(report.latitude) && Number.isFinite(report.longitude))
      const map = L.map(element, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(
        BARANGAY_CENTER,
        12,
        { animate: false },
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      for (const report of points) {
        const marker = L.circleMarker([report.latitude!, report.longitude!], {
          radius: 8,
          color: dark ? '#1b1a19' : '#ffffff',
          weight: 2,
          fillColor: colour(report.status),
          fillOpacity: 1,
          className: 'pin-drop',
        })
        marker.bindTooltip(`${t(label(report.resident_category))} · ${t(report.status)}`, {
          direction: 'top',
          offset: [0, -6],
        })
        if (onSelect) marker.on('click', () => onSelect(report))
        marker.addTo(map)
      }
      if (points.length === 1) map.setView([points[0].latitude!, points[0].longitude!], 15, { animate: false })
      if (points.length > 1)
        map.fitBounds(
          points.map(report => [report.latitude!, report.longitude!] as [number, number]),
          { padding: [28, 28], maxZoom: 16, animate: false },
        )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, reports, dark])
  return (
    <div
      ref={setElement}
      className={cn('h-full min-h-64 w-full', className)}
      role="img"
      aria-label={`${t('Incident map')}: ${reports.length}`}
    />
  )
}

export function MapLegend({ className }: { className?: string }) {
  const t = useText()
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground', className)}>
      {Object.entries(STATUS_STYLE).map(([status, style]) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: style.color }} aria-hidden="true" />
          {t(status)}
        </li>
      ))}
    </ul>
  )
}
