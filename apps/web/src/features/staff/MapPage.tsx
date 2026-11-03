import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { NativeSelect } from '@/components/ui/native-select'
import { useText } from '../../lib/i18n'
import { statuses } from '../reports/categories'
import { groupCases } from '../reports/grouping'
import { useReports } from '../reports/queries'
import { BarangayFilter, LockedBarangay, useBarangayFilter } from './BarangayFilter'
import { MapLegend, StaffMap } from './StaffMap'

export function MapPage() {
  const t = useText()
  const navigate = useNavigate()
  const reports = useReports()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const barangay = params.get('barangay') ?? ''
  const all = reports.data
  const area = useBarangayFilter(all, barangay)
  // One pin per grouped case.
  const rows = useMemo(() => groupCases(all ?? []).rows, [all])
  const visible = useMemo(
    () => rows.filter(report => (!status || report.status === status) && area.matches(report)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- area.matches changes only with these two.
    [rows, status, area.enabled, barangay],
  )
  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  return (
    <div className="relative h-[calc(100svh-3.5rem)] md:h-[calc(100svh-3.5rem-1rem)]">
      <StaffMap
        reports={visible}
        className="absolute inset-0 md:rounded-b-xl"
        onSelect={report => navigate(`/desk/reports/${report.id}`)}
      />
      <div className="glass hairline absolute top-3 right-3 z-[500] w-64 space-y-2.5 rounded-2xl p-3 shadow-lg">
        <label className="block">
          <span className="sr-only">{t('Filter by status')}</span>
          <NativeSelect
            aria-label={t('Filter by status')}
            value={status}
            onChange={event => setFilter('status', event.target.value)}
          >
            <option value="">{t('All statuses')}</option>
            {statuses.map(item => (
              <option key={item} value={item}>
                {t(item)}
              </option>
            ))}
          </NativeSelect>
        </label>
        {area.enabled && (
          <BarangayFilter names={area.names} value={barangay} onChange={value => setFilter('barangay', value)} />
        )}
        {area.locked && <LockedBarangay name={area.locked} />}
        <p className="text-[12.5px] text-muted-foreground">
          {visible.length} {t('of')} {rows.length} {t('reports')} · {t('Click a pin to open it.')}
        </p>
        <MapLegend />
      </div>
    </div>
  )
}
