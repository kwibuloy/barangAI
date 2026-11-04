import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { m } from 'motion/react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ArrowRight, CircleCheckBig, Inbox, Layers, Sparkles, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateText } from '@/components/DateText'
import { EmptyState } from '@/components/page'
import { shownError } from '../../lib/live'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { categories, label } from '../reports/categories'
import { CategoryTile, categoryColor } from '../reports/CategoryIcon'
import { useBrief, useReports } from '../reports/queries'
import { Kap } from '@/components/Kap'
import { useCountUp } from '@/hooks/use-count-up'
import { cn } from '@/lib/utils'
import { StatusBadge } from '../reports/StatusBadge'
import type { Report } from '../reports/types'
import { MapLegend, StaffMap } from './StaffMap'

const DAYS = 14
const chartConfig = { count: { label: 'Reports', color: 'var(--chart-1)' } } satisfies ChartConfig

function Kpi({
  label: title,
  value,
  icon: Icon,
  color,
  to,
  index,
}: {
  label: string
  value: number
  icon: typeof Inbox
  color: string
  to: string
  index: number
}) {
  const shown = useCountUp(value)
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Phones stack the icon over the number so a two-column grid leaves the label its full width. */}
      <Link
        to={to}
        className="group edge flex h-full flex-col items-start gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
      >
        <span
          className="grid size-11 shrink-0 place-items-center rounded-2xl text-white sm:size-14 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105"
          style={{ backgroundColor: color, boxShadow: `0 4px 0 color-mix(in oklab, ${color} 70%, black)` }}
        >
          <Icon className="size-6 sm:size-7" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <strong className="block text-[30px] sm:text-[34px] leading-none tracking-tight tabular-nums">{shown}</strong>
          <span className="mt-1.5 block text-[14px] font-bold text-muted-foreground">
            <Txt>{title}</Txt>
          </span>
        </span>
      </Link>
    </m.div>
  )
}

export function OverviewPage() {
  const t = useText()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const reports = useReports()
  const all = useMemo(() => reports.data ?? [], [reports.data])
  const count = (...statuses: Report['status'][]) => all.filter(report => statuses.includes(report.status)).length
  const trend = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, index) => {
        const day = new Date()
        day.setHours(0, 0, 0, 0)
        day.setDate(day.getDate() - (DAYS - 1 - index))
        return {
          day: day.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-GB', { day: 'numeric', month: 'short' }),
          count: all.filter(
            report => report.created_at && new Date(report.created_at).toDateString() === day.toDateString(),
          ).length,
        }
      }),
    [all, language],
  )
  const byCategory = categories
    .map(item => ({ ...item, count: all.filter(report => report.resident_category === item.value).length }))
    .sort((a, b) => b.count - a.count)
  const maxCategory = Math.max(1, ...byCategory.map(item => item.count))
  const attention = all
    .filter(report => ['Pending', 'Under Verification'].includes(report.status))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 6)
  const today = new Intl.DateTimeFormat(language === 'fil' ? 'fil-PH' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
  return (
    <div className="mx-auto max-w-[1400px] space-y-8 p-5 md:p-8 xl:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps text-[12px] text-muted-foreground">{today}</p>
          <h1 className="display mt-1 text-[34px]">
            <Txt>Operations overview</Txt>
          </h1>
        </div>
      </div>
      <BriefCard />
      {shownError(reports) && (
        <p role="alert" className="text-[14px] text-destructive">
          <Txt>{shownError(reports)?.message ?? ''}</Txt>
        </p>
      )}

      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        <Kpi
          index={0}
          label="Waiting for review"
          value={count('Pending', 'Under Verification')}
          icon={Inbox}
          color="#ff9600"
          to="/desk/reports?status=Pending"
        />
        <Kpi
          index={1}
          label="Being worked on"
          value={count('Accepted', 'In Progress')}
          icon={Wrench}
          color="#1cb0f6"
          to="/desk/reports?status=In+Progress"
        />
        <Kpi
          index={2}
          label="Resolved"
          value={count('Resolved')}
          icon={CircleCheckBig}
          color="#58cc02"
          to="/desk/reports?status=Resolved"
        />
        <Kpi index={3} label="Total reports" value={all.length} icon={Layers} color="#ce82ff" to="/desk/reports" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              <Txt>New reports</Txt> <span className="font-normal text-muted-foreground">· {t('Last 14 days')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="aspect-auto h-[340px] w-full">
              <AreaChart data={trend} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Area
                  dataKey="count"
                  name={t('Reports')}
                  type="monotone"
                  stroke="var(--color-count)"
                  strokeWidth={3.5}
                  activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--card)' }}
                  fill="url(#trend-fill)"
                  animationDuration={500}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Txt>Category distribution</Txt>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3.5">
              {byCategory.map(item => (
                <li key={item.value} className="flex items-center gap-3 text-[14px] font-bold">
                  <CategoryTile category={item.value} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate">
                        <Txt>{item.label}</Txt>
                      </span>
                      <strong className="tabular-nums">{item.count}</strong>
                    </span>
                    <span className="mt-1.5 block h-3 overflow-hidden rounded-full bg-muted">
                      <m.span
                        style={{ backgroundColor: categoryColor(item.value) }}
                        className="block h-full origin-left rounded-full"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: item.count / maxCategory }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              <Txt>Needs attention</Txt>
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/desk/reports">
                  <Txt>View all</Txt> <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <EmptyState pose="clipboard" title={t('All caught up')} body={t('No reports are waiting for review.')} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Txt>Incident category</Txt>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      <Txt>Status</Txt>
                    </TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      <Txt>Submitted</Txt>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attention.map(report => (
                    <TableRow
                      key={report.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/desk/reports/${report.id}`)}
                    >
                      {/* Phones wrap the category, show the status under it and drop the date: no sideways scrolling. */}
                      <TableCell className="max-sm:whitespace-normal">
                        <Link
                          to={`/desk/reports/${report.id}`}
                          className="flex items-center gap-2.5 font-medium"
                          onClick={event => event.stopPropagation()}
                        >
                          <CategoryTile category={report.resident_category} size="sm" />
                          <span className="min-w-0">
                            <Txt>{label(report.resident_category)}</Txt>
                            <span className="block font-mono text-[12px] font-normal text-muted-foreground">
                              #{report.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className="mt-1.5 block sm:hidden">
                              <StatusBadge status={report.status} />
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StatusBadge status={report.status} />
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                        {report.created_at && <DateText value={report.created_at} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle>
              <Txt>Incident map</Txt>
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/desk/map">
                  <Txt>Open map</Txt> <ArrowRight />
                </Link>
              </Button>
            </CardAction>
            <MapLegend className="col-span-full mt-1" />
          </CardHeader>
          <StaffMap reports={all} className="min-h-72" onSelect={report => navigate(`/desk/reports/${report.id}`)} />
        </Card>
      </div>
    </div>
  )
}

/** Kap's morning brief: the API counts the numbers; the model may only reword them (brief.py checks every number). */
function BriefCard() {
  const t = useText()
  const { language } = useLanguage()
  const brief = useBrief(language)
  // The brief is a convenience: if it fails or looks wrong, the rest of the overview stands on its own.
  const data = typeof brief.data?.summary === 'string' && brief.data.facts ? brief.data : undefined
  if (brief.isError || (brief.isSuccess && !data)) return null
  return (
    <section aria-live="polite" className="flex flex-col items-center gap-2 sm:flex-row sm:items-end">
      <Kap pose="clipboard" motion="pop" className="h-32 shrink-0" />
      <div className="kap-bubble kap-bubble-left relative mb-4 min-w-0 flex-1 space-y-2 rounded-3xl border-2 border-b-4 bg-card p-5 sm:ml-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[19px]">
            <Txt>Kap's brief</Txt>
          </h2>
          {data && (
            <span className="inline-flex items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-[12px] font-bold text-muted-foreground">
              {data.source === 'workers_ai' && <Sparkles className="size-3" aria-hidden="true" />}
              <Txt>{data.source === 'workers_ai' ? "Worded by AI from today's numbers" : "From today's numbers"}</Txt>
            </span>
          )}
        </div>
        <p className={cn('max-w-[75ch] text-[15.5px] leading-relaxed', !data && 'shimmer h-12 rounded-lg')}>
          {data?.summary}
        </p>
        {data && (
          <p className="text-[12.5px] text-muted-foreground">
            <Txt>An automatic summary. Check the reports themselves before you act.</Txt>
          </p>
        )}
        {data && data.facts.high_priority.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {data.facts.high_priority.map(item => (
              <Link
                key={item.id}
                to={`/desk/reports/${item.id}`}
                className="edge inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-[13.5px] font-bold"
              >
                <CategoryTile category={item.category} size="sm" />
                {t(label(item.category))}
                {item.place ? ` · ${item.place}` : ''}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
