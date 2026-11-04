import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { CircleCheckBig, Layers, Link2, MapPin, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DateText, dateLabel } from '@/components/DateText'
import { EmptyState } from '@/components/page'
import { cn } from '@/lib/utils'
import { shownError } from '../../lib/live'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { categories, label, statuses } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { ReportHeading, ReportView, type StaffFlow } from '../reports/ReportDetail'
import { groupCases } from '../reports/grouping'
import { useReport, useReports } from '../reports/queries'
import { LEVEL_LABEL, PriorityChip } from '../reports/Priority'
import { TrustChip } from '../reports/Trust'
import { StatusBadge } from '../reports/StatusBadge'
import type { Report } from '../reports/types'
import { BarangayFilter, LockedBarangay, useBarangayFilter } from './BarangayFilter'
import { BulkStart } from './BulkStart'
import { ALL_STATUSES, matchesStatus, WAITING, WORKING } from './queueFilter'

const SAVED_SHOWN_MS = 8000

/** The report's photo once its row is on screen. The image route logs each person's view of a photo, so a row far down
    a long list must not ask for it; the category tile stands in meanwhile and if the photo fails. */
function Thumbnail({ report }: { report: Report }) {
  const box = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const node = box.current
    if (!node || typeof IntersectionObserver !== 'function') {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setSeen(true)
      observer.disconnect()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <span ref={box} className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
      <CategoryTile category={report.resident_category} />
      {seen && !failed && (
        <img
          src={`/api/reports/${report.id}/image`}
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  )
}

/** Review queue as a split view; filters live in the URL so a reviewed report returns to the same list. */
export function QueuePage() {
  const t = useText()
  const { language } = useLanguage()
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
    const inStatus = matchesStatus(status)
    const rows = grouped.rows.filter(
      report =>
        inStatus(report.status) &&
        (!category || report.resident_category === category) &&
        area.matches(report) &&
        (!needle ||
          report.id.toLowerCase().startsWith(needle.replace(/^#/, '')) ||
          (report.description ?? '').toLowerCase().includes(needle) ||
          (report.location_label ?? '').toLowerCase().includes(needle) ||
          (report.barangay ?? '').toLowerCase().includes(needle) ||
          t(label(report.resident_category)).toLowerCase().includes(needle)),
    )
    return sort === 'priority' ? [...rows].sort((a, b) => (b.priority?.score ?? -1) - (a.priority?.score ?? -1)) : rows
    // eslint-disable-next-line react-hooks/exhaustive-deps -- area.matches changes only with these two.
  }, [grouped, status, category, query, sort, t, area.enabled, barangay])
  const search = params.toString() ? `?${params}` : ''
  // Only a report that can move: an unchecked "I see this too" needs its case decision first, and the API says so.
  const selectable = visible.filter(
    report => report.status === 'Pending' && !(report.case_id && !report.case_confirmed),
  )
  const [selecting, setSelecting] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const selected = selectable.filter(report => chosen.has(report.id)).map(report => report.id)
  function toggle(reportId: string, on: boolean) {
    setChosen(current => {
      const next = new Set(current)
      if (on) next.add(reportId)
      else next.delete(reportId)
      return next
    })
  }
  // A confirmation that outlives the report it was about, since "and next" moves on at once.
  const [saved, setSaved] = useState('')
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(''), SAVED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [saved])
  const at = visible.findIndex(report => report.id === id)
  const nextId = [...visible.slice(at + 1), ...visible.slice(0, Math.max(at, 0))].find(report => report.id !== id)?.id
  const flow: StaffFlow = {
    onSaved: (report, moved) =>
      setSaved(
        `#${report.id.slice(0, 8).toUpperCase()} ${t('is now')} ${t(moved)}. ${t('The resident can see your note.')}`,
      ),
    next: nextId ? () => void navigate(`/desk/reports/${nextId}${search}`) : undefined,
  }
  const presets = [
    { value: WAITING.join(','), label: 'Waiting for review' },
    { value: WORKING.join(','), label: 'Being worked on' },
  ]
  const listed = [ALL_STATUSES, '', ...presets.map(item => item.value), ...statuses]
  const rowName = (report: Report) =>
    [
      `${t('Review report')}: ${t(label(report.resident_category))}`,
      t(report.status),
      report.created_at && dateLabel(report.created_at, language),
      report.priority && report.priority.level !== 'low' && t(LEVEL_LABEL[report.priority.level]),
      `#${report.id.slice(0, 8).toUpperCase()}`,
    ]
      .filter(Boolean)
      .join(', ')
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
              placeholder={t('Search words, street or barangay')}
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
                <option value="">{t('Open reports')}</option>
                <option value={ALL_STATUSES}>{t('All statuses')}</option>
                {presets.map(item => (
                  <option key={item.value} value={item.value}>
                    {t(item.label)}
                  </option>
                ))}
                {/* A list opened from a link keeps its name, whichever statuses the link asked for. */}
                {!listed.includes(status as never) && (
                  <option value={status}>
                    {status
                      .split(',')
                      .map(item => t(item))
                      .join(', ')}
                  </option>
                )}
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="link"
              size="xs"
              className="px-0"
              onClick={() => setFilter('status', status === ALL_STATUSES ? '' : ALL_STATUSES)}
            >
              <Txt>{status === ALL_STATUSES ? 'Open reports only' : 'See all reports'}</Txt>
            </Button>
            {(selecting || selectable.length > 0) && (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="px-0"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting(!selecting)
                  setChosen(new Set())
                }}
              >
                <Txt>{selecting ? 'Stop selecting' : 'Select several'}</Txt>
              </Button>
            )}
          </div>
        </div>
        {shownError(reports) && (
          <p role="alert" className="p-3 text-[14px] text-destructive">
            <Txt>{shownError(reports)?.message ?? ''}</Txt>
          </p>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {selecting && (
            <BulkStart
              selected={selected}
              onFinished={done => done.forEach(reportId => toggle(reportId, false))}
              onCancel={() => {
                setSelecting(false)
                setChosen(new Set())
              }}
            />
          )}
          <ul className="space-y-1 p-3">
            {reports.data && visible.length === 0 && (
              <li className="px-3 py-10 text-center text-[14px] text-muted-foreground">
                <Txt>{all?.length ? 'No reports match these filters.' : 'New resident reports will appear here.'}</Txt>
              </li>
            )}
            {visible.map(report => (
              <li key={report.id} className="flex items-center gap-1">
                {/* Same space on every row, so the list doesn't jump sideways between rows. */}
                {selecting && !selectable.includes(report) && <span className="size-11 shrink-0" />}
                {selecting && selectable.includes(report) && (
                  <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                    <span className="sr-only">
                      {t('Select report')} #{report.id.slice(0, 8).toUpperCase()}
                    </span>
                    <input
                      type="checkbox"
                      checked={chosen.has(report.id)}
                      onChange={event => toggle(report.id, event.target.checked)}
                      className="size-5 accent-primary"
                    />
                  </label>
                )}
                <Link
                  to={`/desk/reports/${report.id}${search}`}
                  aria-label={rowName(report)}
                  aria-current={report.id === id ? 'page' : undefined}
                  className={cn(
                    'flex min-w-0 flex-1 gap-3.5 rounded-xl px-4 py-3.5 transition-colors hover:bg-accent',
                    report.id === id && 'bg-tint hover:bg-tint',
                  )}
                >
                  <Thumbnail report={report} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <strong className="min-w-0 text-[14.5px] font-semibold break-words">
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
                      {report.priority && report.priority.level !== 'low' && (
                        <PriorityChip priority={report.priority} />
                      )}
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
        </div>
      </section>
      <section className={cn('scroll-thin min-h-0 overflow-y-auto', !id && 'hidden lg:block')}>
        {/* Always in the page, so screen readers hear what appears in it. */}
        <div role="status" className="sticky top-0 z-10 mx-auto max-w-5xl px-6 md:px-8">
          {saved && (
            <p className="edge mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-[14px] font-bold">
              <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-[var(--status-resolved)]" aria-hidden="true" />
              <span className="min-w-0 break-words">{saved}</span>
            </p>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {id ? (
            <m.div
              key={id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <DetailPane id={id} flow={flow} onClose={() => navigate(`/desk/reports${search}`)} />
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

function DetailPane({ id, flow, onClose }: { id: string; flow: StaffFlow; onClose: () => void }) {
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
      <ReportView id={id} staff flow={flow} />
    </div>
  )
}
