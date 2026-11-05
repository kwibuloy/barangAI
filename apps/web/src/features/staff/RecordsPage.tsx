import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, Minus, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageSpinner } from '@/components/page'
import { DemoChip } from '@/components/DemoChip'
import { cn } from '@/lib/utils'
import { api } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import { label, rejectionReasons } from '../reports/categories'
import { useReports } from '../reports/queries'
import type { Category } from '../reports/types'
import { useBarangayFilter } from './BarangayFilter'

type Count = { reports: number; incidents: number }
type Period = {
  received: Count
  accepted: Count
  resolved: Count
  rejected: Count
  median_hours_to_accept: number | null
  median_hours_to_resolve: number | null
}
type Records = Period & {
  barangay: string | null
  unassigned: boolean
  previous: Period & { from: string; to: string }
  verified_categories: { category: Category; reports: number }[]
  not_yet_verified: number
  rejection_reasons: { reason: string; reports: number }[]
  open_now: { up_to_7_days: number; '8_to_30_days': number; over_30_days: number; total: number }
}

const thisMonth = () => {
  const manila = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return manila.toISOString().slice(0, 7)
}

function monthBounds(month: string) {
  const [year, number] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

type RollupRow = {
  barangay: string | null
  received: Count
  resolved: Count
  median_hours_to_resolve: number | null
  open_over_30_days: number
}
type Rollup = { rows: RollupRow[]; total: RollupRow; quiet_barangays: number }

/** The change in words with an arrow, in one quiet colour: more isn't always better, and it has to survive a printer. */
function Change({ text }: { text: { icon: 'up' | 'down' | 'same'; words: string } | null }) {
  const t = useText()
  if (!text)
    return (
      <p className="mt-1 text-[13px] text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('Nothing to compare with last month')}</span>
      </p>
    )
  const Icon = { up: ArrowUp, down: ArrowDown, same: Minus }[text.icon]
  return (
    <p className="mt-1.5 flex items-start gap-1 text-[14px] font-bold text-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
      <span>{text.words}</span>
    </p>
  )
}

function Figure({
  title,
  count,
  note,
  change,
}: {
  title: string
  count: number | string
  note?: string
  change?: Parameters<typeof Change>[0]['text']
}) {
  return (
    <div className="hairline rounded-2xl bg-card p-4 print:rounded-none print:border print:shadow-none">
      <p className="text-[28px] leading-none font-extrabold tabular-nums">{count}</p>
      <p className="mt-1.5 text-[14px] font-bold">
        <Txt>{title}</Txt>
      </p>
      {note && <p className="mt-0.5 text-[13px] text-muted-foreground">{note}</p>}
      {change !== undefined && <Change text={change} />}
    </div>
  )
}

/** "3.5 hours" under two days, whole days after: staff read this aloud at meetings. */
function useDuration() {
  const t = useText()
  return (value: number | null) => {
    if (value === null) return '—'
    return value < 48 ? `${value} ${t('hours')}` : `${Math.round(value / 24)} ${t('days')}`
  }
}

type SortKey = 'barangay' | 'received' | 'received_incidents' | 'resolved' | 'resolved_incidents' | 'time' | 'open'
const SORT_VALUE: Record<Exclude<SortKey, 'barangay'>, (row: RollupRow) => number | null> = {
  received: row => row.received.reports,
  received_incidents: row => row.received.incidents,
  resolved: row => row.resolved.reports,
  resolved_incidents: row => row.resolved.incidents,
  time: row => row.median_hours_to_resolve,
  open: row => row.open_over_30_days,
}
// Phones keep the columns that fit without sideways scrolling; larger screens, the spreadsheet and paper have them all.
const WIDE_ONLY = 'max-md:hidden print:table-cell'
const ROLLUP_COLUMNS: { key: SortKey; title: string; wide?: boolean }[] = [
  { key: 'barangay', title: 'Barangay' },
  { key: 'received', title: 'Reports received' },
  { key: 'received_incidents', title: 'Incidents received', wide: true },
  { key: 'resolved', title: 'Reports resolved' },
  { key: 'resolved_incidents', title: 'Incidents resolved', wide: true },
  { key: 'time', title: 'Typical time to resolve' },
  { key: 'open', title: 'Reports open over 30 days', wide: true },
]

/** Every barangay side by side, for administrators; the API refuses anyone else. */
function RollupCard({ search, area }: { search: string; area: string }) {
  const t = useText()
  const duration = useDuration()
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'barangay', descending: false })
  const rollup = useQuery({
    queryKey: ['records-rollup', search],
    queryFn: () => api<Rollup>(`/staff/records/rollup?${search}`),
  })
  const rows = useMemo(() => {
    const items = [...(rollup.data?.rows ?? [])]
    const { key, descending } = sort
    if (key === 'barangay') {
      // The reports outside every boundary stay last, whichever way the names run.
      const named = items.filter(row => row.barangay).sort((a, b) => a.barangay!.localeCompare(b.barangay!))
      return [...(descending ? named.reverse() : named), ...items.filter(row => !row.barangay)]
    }
    const value = SORT_VALUE[key]
    // A barangay with nothing measured stays at the bottom either way.
    return items.sort((a, b) => {
      const first = value(a)
      const second = value(b)
      if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1
      return descending ? second - first : first - second
    })
  }, [rollup.data, sort])
  if (rollup.isPending) return null
  if (rollup.isError)
    return (
      <p role="alert" className="text-[14px] text-destructive">
        <Txt>{rollup.error.message}</Txt>
      </p>
    )
  const name = (row: RollupRow) => row.barangay ?? t('Outside every boundary')
  return (
    <Card className="print:break-inside-avoid print:rounded-none print:shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          <Txt>Rollup by barangay</Txt> · {area}
        </CardTitle>
        <Button variant="outline" size="sm" asChild className="print:hidden">
          <a href={`/api/staff/records/rollup.csv?${search}`} download>
            <Download className="size-4" aria-hidden="true" />
            <Txt>Download rollup</Txt>
          </a>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            <Txt>No barangay has anything to count this month.</Txt>
          </p>
        ) : (
          <Table className="max-md:text-[13px] max-md:[&_td]:px-1 max-md:[&_th]:px-1">
            <TableHeader>
              <TableRow>
                {ROLLUP_COLUMNS.map(column => {
                  const active = sort.key === column.key
                  const Arrow = sort.descending ? ChevronDown : ChevronUp
                  return (
                    <TableHead
                      key={column.key}
                      aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                      className={cn(
                        'h-auto align-bottom whitespace-normal max-md:px-1',
                        column.key !== 'barangay' && 'text-right',
                        column.wide && WIDE_ONLY,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSort(current => ({
                            key: column.key,
                            // Names start from A, and counts from the largest, which is what people look for first.
                            descending: current.key === column.key ? !current.descending : column.key !== 'barangay',
                          }))
                        }
                        className={cn(
                          'inline-flex min-h-9 items-end gap-1 py-1 text-left font-bold hover:text-foreground print:min-h-0',
                          column.key !== 'barangay' && 'justify-end text-right',
                          active && 'text-foreground',
                        )}
                      >
                        <Txt>{column.title}</Txt>
                        <Arrow
                          className={cn('mb-0.5 size-3.5 shrink-0 print:hidden', !active && 'hidden')}
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      </button>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={name(row)}>
                  <TableCell className="font-semibold whitespace-normal max-md:px-1">{name(row)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.received.reports}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>{row.received.incidents}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.resolved.reports}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>{row.resolved.incidents}</TableCell>
                  <TableCell className="text-right tabular-nums">{duration(row.median_hours_to_resolve)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>{row.open_over_30_days}</TableCell>
                </TableRow>
              ))}
              {rollup.data && (
                <TableRow className="border-t-2 font-extrabold">
                  <TableCell>
                    <Txt>All barangays</Txt>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rollup.data.total.received.reports}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>
                    {rollup.data.total.received.incidents}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rollup.data.total.resolved.reports}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>
                    {rollup.data.total.resolved.incidents}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {duration(rollup.data.total.median_hours_to_resolve)}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>
                    {rollup.data.total.open_over_30_days}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-[13px] text-muted-foreground">
          {rollup.data && rollup.data.quiet_barangays > 0 && (
            <>
              {rollup.data.quiet_barangays} <Txt>other barangays had nothing to count.</Txt>{' '}
            </>
          )}
          <Txt>A report is one resident's submission. An incident counts reports staff grouped as one.</Txt>
          <span className="md:hidden print:hidden">
            {' '}
            <Txt>More columns on a larger screen and in the spreadsheet.</Txt>
          </span>
        </p>
      </CardContent>
    </Card>
  )
}

/** A month's figures for the barangay's records and meetings. Every number is counted by the API from stored reports. */
export function RecordsPage() {
  const t = useText()
  const { language } = useLanguage()
  const duration = useDuration()
  const me = useMe().data
  // ?month=2026-10 opens that month, so a link or a recording can start there.
  const [params] = useSearchParams()
  const [month, setMonth] = useState(() => {
    const asked = params.get('month')
    return asked && /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth() ? asked : thisMonth()
  })
  const [barangay, setBarangay] = useState('')
  const reports = useReports()
  const area = useBarangayFilter(reports.data, barangay)
  const validMonth = /^\d{4}-\d{2}$/.test(month)
  const search = new URLSearchParams({
    ...(validMonth ? monthBounds(month) : { from: '', to: '' }),
    ...(area.enabled && barangay ? { barangay } : {}),
  }).toString()
  const records = useQuery({
    queryKey: ['records', search],
    queryFn: () => api<Records>(`/staff/records?${search}`),
    enabled: validMonth,
  })
  const data = records.data
  const monthName = validMonth
    ? new Intl.DateTimeFormat(language === 'fil' ? 'fil-PH' : 'en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${month}-01T00:00:00Z`))
    : ''
  const place = data?.unassigned
    ? t('Not assigned to a barangay')
    : data?.barangay === 'outside'
      ? t('Outside every boundary')
      : (data?.barangay ?? t('All barangays'))
  const reportCount = (total: number) => `${total} ${t(total === 1 ? 'report' : 'reports')}`
  const incidents = (count: Count) => `${count.incidents} ${t(count.incidents === 1 ? 'incident' : 'incidents')}`
  const before = data?.previous
  const earlierEmpty =
    !before ||
    before.received.reports + before.accepted.reports + before.resolved.reports + before.rejected.reports === 0
  const countChange = (now: Count, earlier?: Count) => {
    if (earlierEmpty || !earlier) return null
    const difference = now.reports - earlier.reports
    if (difference === 0) return { icon: 'same' as const, words: t('Same as last month') }
    return {
      icon: difference > 0 ? ('up' as const) : ('down' as const),
      words: `${Math.abs(difference)} ${t(difference > 0 ? 'more than last month' : 'fewer than last month')}`,
    }
  }
  const timeChange = (now: number | null, earlier: number | null | undefined) => {
    if (now === null || earlier === null || earlier === undefined) return null
    const difference = Math.round((now - earlier) * 10) / 10
    if (difference === 0) return { icon: 'same' as const, words: t('Same as last month') }
    return {
      icon: difference > 0 ? ('up' as const) : ('down' as const),
      words: `${duration(Math.abs(difference))} ${t(difference > 0 ? 'slower than last month' : 'faster than last month')}`,
    }
  }
  const short = (value: string) =>
    new Intl.DateTimeFormat(language === 'fil' ? 'fil-PH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`))

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-5 md:p-8 xl:p-10 print:max-w-none print:space-y-4 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps text-[12px] text-muted-foreground">{monthName}</p>
          <h1 className="display mt-1 text-[34px] print:text-[24px]">
            <Txt>Monthly report</Txt>
          </h1>
          <p className="mt-1 text-[15px] font-semibold">{place}</p>
          {/* On screen the shell carries the label; a sheet of paper has only this. */}
          <DemoChip long className="mt-1 hidden print:inline-flex" />
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="text-[13px] font-bold">
            <span className="sr-only">{t('Month')}</span>
            <Input type="month" value={month} max={thisMonth()} onChange={event => setMonth(event.target.value)} />
          </label>
          {area.enabled && (
            <label className="w-48">
              <span className="sr-only">{t('Barangay')}</span>
              <Select aria-label={t('Barangay')} value={barangay} onChange={event => setBarangay(event.target.value)}>
                <option value="">{t('All barangays')}</option>
                {area.names.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="outside">{t('Outside every boundary')}</option>
              </Select>
            </label>
          )}
          {data && (
            <Button variant="outline" asChild>
              <a href={`/api/staff/records.csv?${search}`} download>
                <Download className="size-4" aria-hidden="true" />
                <Txt>Download spreadsheet</Txt>
              </a>
            </Button>
          )}
          <Button variant="outline" disabled={!data} onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            <Txt>Print</Txt>
          </Button>
        </div>
      </div>

      {records.isPending && validMonth && <PageSpinner />}
      {records.isError && (
        <p role="alert" className="text-[14px] text-destructive">
          <Txt>{records.error.message}</Txt>
        </p>
      )}

      {data && (
        <>
          {before && !earlierEmpty && (
            <p className="text-[14px] text-muted-foreground">
              <Txt>
                {month === thisMonth()
                  ? 'This month is not over, so it is compared with the same days of last month:'
                  : 'Compared with last month:'}
              </Txt>{' '}
              {short(before.from)} – {short(before.to)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
            <Figure
              title="Reports received"
              count={data.received.reports}
              note={incidents(data.received)}
              change={countChange(data.received, before?.received)}
            />
            <Figure
              title="Reports accepted"
              count={data.accepted.reports}
              note={incidents(data.accepted)}
              change={countChange(data.accepted, before?.accepted)}
            />
            <Figure
              title="Reports resolved"
              count={data.resolved.reports}
              note={incidents(data.resolved)}
              change={countChange(data.resolved, before?.resolved)}
            />
            <Figure
              title="Reports rejected"
              count={data.rejected.reports}
              note={incidents(data.rejected)}
              change={countChange(data.rejected, before?.rejected)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-2">
            <Figure
              title="Typical time to accept"
              count={duration(data.median_hours_to_accept)}
              note={`${t('Based on')} ${reportCount(data.accepted.reports)}`}
              change={timeChange(data.median_hours_to_accept, before?.median_hours_to_accept)}
            />
            <Figure
              title="Typical time to resolve"
              count={duration(data.median_hours_to_resolve)}
              note={`${t('Based on')} ${reportCount(data.resolved.reports)}`}
              change={timeChange(data.median_hours_to_resolve, before?.median_hours_to_resolve)}
            />
          </div>

          {me?.role === 'administrator' && !barangay && <RollupCard search={search} area={monthName} />}

          <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2 print:gap-2">
            <Card className="print:rounded-none print:shadow-none">
              <CardHeader>
                <CardTitle>
                  <Txt>Received this month, by verified category</Txt>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Txt>Category</Txt>
                      </TableHead>
                      <TableHead className="text-right">
                        <Txt>Reports</Txt>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.verified_categories.map(row => (
                      <TableRow key={row.category}>
                        <TableCell>
                          <Txt>{label(row.category)}</Txt>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.reports}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="text-muted-foreground">
                        <Txt>Not yet verified</Txt>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{data.not_yet_verified}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-6 print:space-y-2">
              <Card className="print:rounded-none print:shadow-none">
                <CardHeader>
                  <CardTitle>
                    <Txt>Still open today</Txt> · {data.open_now.total}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-[15px]">
                    <li className="flex justify-between">
                      <Txt>Up to 7 days old</Txt> <b className="tabular-nums">{data.open_now.up_to_7_days}</b>
                    </li>
                    <li className="flex justify-between">
                      <Txt>8 to 30 days old</Txt> <b className="tabular-nums">{data.open_now['8_to_30_days']}</b>
                    </li>
                    <li className="flex justify-between">
                      <Txt>Over 30 days old</Txt> <b className="tabular-nums">{data.open_now.over_30_days}</b>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              {data.rejection_reasons.length > 0 && (
                <Card className="print:rounded-none print:shadow-none">
                  <CardHeader>
                    <CardTitle>
                      <Txt>Why reports were rejected</Txt>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-[15px]">
                      {data.rejection_reasons.map(row => (
                        <li key={row.reason} className="flex justify-between gap-3">
                          <Txt>{rejectionReasons.find(item => item.value === row.reason)?.label ?? row.reason}</Txt>
                          <b className="tabular-nums">{row.reports}</b>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <p className="text-[13px] text-muted-foreground">
            <Txt>
              Counted from stored reports and status history. Reports staff grouped as one incident count once under
              incidents. No resident names or photos are included.
            </Txt>
          </p>
          <div className="hidden grid-cols-2 gap-10 pt-10 text-[13px] print:grid">
            <p className="border-t border-black pt-1">
              <Txt>Prepared by</Txt> ({me?.email})
            </p>
            <p className="border-t border-black pt-1">
              <Txt>Noted by</Txt>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
