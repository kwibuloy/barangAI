import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Alert, EmptyState, LargeTitle, LinkRow, Segmented } from '@/components/page'
import { Button } from '@/components/ui/button'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { label } from './categories'
import { CategoryTile } from './CategoryIcon'
import { ReportHeading, ReportView } from './ReportDetail'
import { useReport, useReports } from './queries'
import { StatusLine } from './StatusBadge'

type Filter = 'active' | 'closed' | 'all'
const CLOSED = ['Resolved', 'Rejected']

/** Resident history. /reports/:id slides the detail up as a sheet on phones; desktops show it beside the list. */
export function ReportsPage() {
  const t = useText()
  const reports = useReports()
  const { id } = useParams()
  const navigate = useNavigate()
  const desktop = useMediaQuery(DESKTOP)
  const [filter, setFilter] = useState<Filter>('all')
  const all = reports.data ?? []
  const shown = all.filter(report =>
    filter === 'all' ? true : filter === 'closed' ? CLOSED.includes(report.status) : !CLOSED.includes(report.status),
  )
  const close = () => navigate('/reports')
  return (
    <div className="lg:mx-auto lg:max-w-6xl">
      <LargeTitle title={t('My reports')} trailing={<ResidentAccount />} />
      {reports.error && (
        <Alert className="mb-4">
          <Txt>{reports.error.message}</Txt>
        </Alert>
      )}
      {/* Desktop: the page stays put; the list and the open report scroll inside their own cards. */}
      <div className="lg:grid lg:h-[calc(100dvh-10.5rem)] lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-8">
        <div className="lg:flex lg:min-h-0 lg:flex-col">
          {all.length > 0 && (
            <Segmented<Filter>
              id="report-filter"
              label={t('Show reports')}
              className="mb-5"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('All') },
                { value: 'active', label: t('Open') },
                { value: 'closed', label: t('Closed') },
              ]}
            />
          )}
          {reports.isSuccess && all.length === 0 ? (
            <EmptyState
              pose="idea"
              title={t('No reports yet')}
              body={t('Submitted concerns and updates will appear here.')}
              action={
                <Button asChild>
                  <Link to="/report">
                    <Txt>Make a report</Txt>
                  </Link>
                </Button>
              }
            />
          ) : (
            shown.length > 0 && (
              <div className="hairline overflow-hidden rounded-2xl bg-card lg:scroll-thin lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {shown.map(report => (
                  <LinkRow
                    key={report.id}
                    to={`/reports/${report.id}`}
                    className={cn(desktop && report.id === id && 'bg-tint hover:bg-tint')}
                    leading={<CategoryTile category={report.resident_category} />}
                    title={<Txt>{label(report.resident_category)}</Txt>}
                    subtitle={
                      <>
                        {report.description && <span className="line-clamp-1">{report.description}</span>}
                        <StatusLine status={report.status} date={report.created_at} />
                      </>
                    }
                  />
                ))}
              </div>
            )
          )}
          {reports.isSuccess && all.length > 0 && shown.length === 0 && (
            <EmptyState pose="thinking" title={t('No reports in this view.')} />
          )}
        </div>
        {desktop && (all.length > 0 || id) && (
          <section className="hairline scroll-thin min-h-0 overflow-y-auto rounded-3xl bg-card">
            <AnimatePresence mode="wait" initial={false}>
              {id ? (
                <m.div
                  key={id}
                  role="region"
                  aria-label={t('Report details')}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <DetailBody id={id} onClose={close} className="p-6" />
                </m.div>
              ) : (
                <m.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10">
                  <EmptyState
                    pose="clipboard"
                    title={t('Choose a report')}
                    body={t('Its photo, categories and status history open here.')}
                  />
                </m.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>
      {!desktop && (
        <Drawer open={Boolean(id)} onOpenChange={open => !open && close()}>
          <DrawerContent className="mx-auto max-h-[94dvh] max-w-2xl data-[vaul-drawer-direction=bottom]:max-h-[94dvh]">
            <DrawerTitle className="sr-only">
              <Txt>Report details</Txt>
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              <Txt>Photo, categories and status history</Txt>
            </DrawerDescription>
            {id && (
              <DetailBody
                key={id}
                id={id}
                onClose={close}
                className="pb-safe scroll-thin overflow-y-auto px-4 pt-2 pb-8"
              />
            )}
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}

function DetailBody({ id, onClose, className }: { id: string; onClose: () => void; className: string }) {
  const t = useText()
  const report = useReport(id)
  return (
    <div className={className}>
      <div className="mb-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ReportHeading report={report.data} id={id} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close details')}
          className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="size-4" strokeWidth={2.5} />
          </span>
        </button>
      </div>
      <ReportView id={id} staff={false} />
    </div>
  )
}
