import { useMemo } from 'react'
import { NativeSelect } from '@/components/ui/native-select'
import { useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import type { Report } from '../reports/types'

const OUTSIDE = 'outside'

/** Administrators see every barangay and can filter them; staff see the one the API limits them to, locked. */
export function useBarangayFilter(reports: Report[] | undefined, value: string) {
  const me = useMe().data
  const administrator = me?.role === 'administrator'
  const names = useMemo(() => [...new Set((reports ?? []).flatMap(report => report.barangay ?? []))].sort(), [reports])
  // No report has a barangay until boundaries are loaded, and then "outside" would wrongly describe all of them.
  const enabled = administrator && names.length > 0
  const selected = enabled ? value : ''
  return {
    enabled,
    locked: me?.role === 'staff' ? (me.barangay ?? null) : null,
    names,
    matches: (report: Report) => !selected || (selected === OUTSIDE ? !report.barangay : report.barangay === selected),
  }
}

export function LockedBarangay({ name, className }: { name: string; className?: string }) {
  const t = useText()
  return (
    <label className={className ?? 'block'}>
      <span className="sr-only">{t('Your barangay')}</span>
      <NativeSelect aria-label={t('Your barangay')} value={name} disabled>
        <option value={name}>{name}</option>
      </NativeSelect>
    </label>
  )
}

export function BarangayFilter({
  names,
  value,
  onChange,
  className,
}: {
  names: string[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const t = useText()
  return (
    <label className={className ?? 'block'}>
      <span className="sr-only">{t('Filter by barangay')}</span>
      <NativeSelect aria-label={t('Filter by barangay')} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{t('All barangays')}</option>
        <option value={OUTSIDE}>{t('Outside every boundary')}</option>
        {names.map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}
