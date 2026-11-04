import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageSpinner } from '@/components/page'
import { api } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import { label, rejectionReasons } from '../reports/categories'
import { useReports } from '../reports/queries'
import type { Category } from '../reports/types'
import { useBarangayFilter } from './BarangayFilter'

type Count = { reports: number; incidents: number }
type Records = {
  barangay: string | null
  unassigned: boolean
  received: Count
  accepted: Count
  resolved: Count
  rejected: Count
  median_hours_to_accept: number | null
  median_hours_to_resolve: number | null
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

function Figure({ title, count, note }: { title: string; count: number | string; note?: string }) {
  return (
    <div className="hairline rounded-2xl bg-card p-4 print:rounded-none print:border print:shadow-none">
      <p className="text-[28px] leading-none font-extrabold tabular-nums">{count}</p>
      <p className="mt-1.5 text-[14px] font-bold">
        <Txt>{title}</Txt>
      </p>
      {note && <p className="mt-0.5 text-[13px] text-muted-foreground">{note}</p>}
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

/** A month's figures for the barangay's records and meetings. Every number is counted by the API from stored reports. */
export function RecordsPage() {
  const t = useText()
  const { language } = useLanguage()
  const duration = useDuration()
  const me = useMe().data
  const [month, setMonth] = useState(thisMonth)
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

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-5 md:p-8 xl:p-10 print:max-w-none print:space-y-4 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps text-[12px] text-muted-foreground">{monthName}</p>
          <h1 className="display mt-1 text-[34px] print:text-[24px]">
            <Txt>Monthly report</Txt>
          </h1>
          <p className="mt-1 text-[15px] font-semibold">{place}</p>
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
            <Figure title="Received" count={data.received.reports} note={incidents(data.received)} />
            <Figure title="Accepted" count={data.accepted.reports} note={incidents(data.accepted)} />
            <Figure title="Resolved" count={data.resolved.reports} note={incidents(data.resolved)} />
            <Figure title="Rejected" count={data.rejected.reports} note={incidents(data.rejected)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-2">
            <Figure
              title="Typical time to accept"
              count={duration(data.median_hours_to_accept)}
              note={`${t('Based on')} ${reportCount(data.accepted.reports)}`}
            />
            <Figure
              title="Typical time to resolve"
              count={duration(data.median_hours_to_resolve)}
              note={`${t('Based on')} ${reportCount(data.resolved.reports)}`}
            />
          </div>

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
