import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { Layers, Link2, MapPin, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DateText } from '@/components/DateText'
import { EmptyState } from '@/components/page'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { categories, label, statuses } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { ReportHeading, ReportView } from '../reports/ReportDetail'
import { groupCases } from '../reports/grouping'
import { useReport, useReports } from '../reports/queries'
import { PriorityChip } from '../reports/Priority'
import { TrustChip } from '../reports/Trust'
import { StatusBadge } from '../reports/StatusBadge'
import { BarangayFilter, LockedBarangay, useBarangayFilter } from './BarangayFilter'

/** Review queue as a split view; filters live in the URL so a reviewed report returns to the same list. */
export function QueuePage() {
  const t = useText()
  const reports = useReports()
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const category = params.get('category') ?? ''
  const query = params.get('q') ?? ''
  // Newest first unless staff choose to sort by the suggested priority.
  const sort = params.get('sort') ?? ''
  const all = reports.data
  // A grouped case is one row (its first report); its other reports open from the case panel.
  const grouped = useMemo(() => groupCases(all ?? []), [all])
  const barangay = params.get('barangay') ?? ''
  const area = useBarangayFilter(all, barangay)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = grouped.rows.filter(
      report =>
        (!status || report.status === status) &&
        (!category || report.resident_category === category) &&
        area.matches(report) &&
        (!needle ||
          report.id.toLowerCase().startsWith(needle.replace(/^#/, '')) ||
          (report.description ?? '').toLowerCase().includes(needle) ||
          t(label(report.resident_category)).toLowerCase().includes(needle)),
    )
    return sort === 'priority' ? [...rows].sort((a, b) => (b.priority?.score ?? -1) - (a.priority?.score ?? -1)) : rows
    // eslint-disable-next-line react-hooks/exhaustive-deps -- area.matches changes only with these two.
  }, [grouped, status, category, query, sort, t, area.enabled, barangay])
  const search = params.toString() ? `?${params}` : ''
  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  return (
    <div className="grid h-[calc(100svh-var(--staff-chrome))] min-h-0 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <section className={cn('flex min-h-0 flex-col border-r', id && 'hidden lg:flex')}>
        <div className="space-y-3 border-b p-4">
          <label className="relative block">
            <span className="sr-only">
              <Txt>Search reports</Txt>
            </span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={event => setFilter('q', event.target.value)}
              placeholder={t('Search by reference, words or category')}
              className="h-9 rounded-lg pl-9 lg:text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="sr-only">
                <Txt>Filter by status</Txt>
              </span>
              <Select
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
              </Select>
            </label>
            <label>
              <span className="sr-only">
                <Txt>Filter by category</Txt>
              </span>
              <Select
                aria-label={t('Filter by category')}
                value={category}
                onChange={event => setFilter('category', event.target.value)}
              >
                <option value="">{t('All categories')}</option>
                {categories.map(item => (
                  <option key={item.value} value={item.value}>
                    {t(item.label)}
                  </option>
                ))}
              </Select>
            </label>
            {area.enabled && (
              <BarangayFilter
                names={area.names}
                value={barangay}
                onChange={value => setFilter('barangay', value)}
                className="col-span-2"
              />
            )}
            {area.locked && <LockedBarangay name={area.locked} className="col-span-2" />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="px-0.5 text-[12.5px] text-muted-foreground" aria-live="polite">
              {visible.length} {t('of')} {grouped.rows.length} {t('reports')}
            </p>
            <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Txt>Sort</Txt>
              <Select
                aria-label={t('Sort reports')}
                value={sort}
                onChange={event => setFilter('sort', event.target.value)}
                className="h-8 w-auto text-[12.5px]"
              >
                <option value="">{t('Newest')}</option>
                <option value="priority">{t('Suggested priority')}</option>
              </Select>
            </label>
          </div>
        </div>
        {reports.error && (
          <p role="alert" className="p-3 text-[14px] text-destructive">
            <Txt>{reports.error.message}</Txt>
          </p>
        )}
        <ul className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {reports.isSuccess && visible.length === 0 && (
            <li className="px-3 py-10 text-center text-[14px] text-muted-foreground">
              <Txt>{all?.length ? 'No reports match these filters.' : 'New resident reports will appear here.'}</Txt>
            </li>
          )}
          {visible.map(report => (
            <li key={report.id}>
              <Link
                to={`/desk/reports/${report.id}${search}`}
                aria-label={`${t('Review report')}: ${t(label(report.resident_category))}`}
                aria-current={report.id === id ? 'page' : undefined}
                className={cn(
                  'flex gap-3.5 rounded-xl px-4 py-3.5 transition-colors hover:bg-accent',
                  report.id === id && 'bg-tint hover:bg-tint',
                )}
              >
                <CategoryTile category={report.resident_category} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <strong className="truncate text-[14.5px] font-semibold">
                      <Txt>{label(report.resident_category)}</Txt>
                    </strong>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {report.created_at && <DateText value={report.created_at} />}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-[13.5px] text-muted-foreground">
                    {report.description || `#${report.id.slice(0, 8).toUpperCase()}`}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={report.status} />
                    {report.priority && report.priority.level !== 'low' && <PriorityChip priority={report.priority} />}
                    {report.trust_flags && <TrustChip flags={report.trust_flags} />}
                    {area.enabled && (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full whitespace-nowrap bg-muted px-2 text-[12.5px] font-semibold text-muted-foreground">
                        <MapPin className="size-3.5" aria-hidden="true" />
                        {report.barangay ?? t('Outside every boundary')}
                      </span>
                    )}
                    {grouped.sizeOf(report) > 1 && (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full whitespace-nowrap bg-tint px-2 text-[12.5px] font-semibold text-link">
                        <Layers className="size-3.5" aria-hidden="true" />
                        {grouped.sizeOf(report)} {t('reports')}
                      </span>
                    )}
                    {report.case_id && !report.case_confirmed && (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full whitespace-nowrap bg-muted px-2 text-[12.5px] font-semibold text-muted-foreground">
                        <Link2 className="size-3.5" aria-hidden="true" />
                        <Txt>Added to a case · check</Txt>
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className={cn('scroll-thin min-h-0 overflow-y-auto', !id && 'hidden lg:block')}>
        <AnimatePresence mode="wait" initial={false}>
          {id ? (
            <m.div
              key={id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <DetailPane id={id} onClose={() => navigate(`/desk/reports${search}`)} />
            </m.div>
          ) : (
            <m.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid h-full place-items-center"
            >
              <EmptyState
                pose="clipboard"
                title={t('Select a report to review')}
                body={t('Photos, categories, history and staff actions open here.')}
              />
            </m.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

function DetailPane({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useText()
  const report = useReport(id)
  return (
    <div role="region" aria-label={t('Report details')} className="mx-auto max-w-5xl p-6 md:p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <ReportHeading report={report.data} id={id} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close details')}
          className="group -mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
            <X className="size-4" strokeWidth={2.5} />
          </span>
        </button>
      </div>
      <ReportView id={id} staff />
    </div>
  )
}
