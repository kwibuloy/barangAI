import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { cn } from '@/lib/utils'
import { shownError } from '../../lib/live'
import { Txt, useText } from '../../lib/i18n'
import { label } from './categories'
import { CategoryTile } from './CategoryIcon'
import { DeletionReview, RequestDeletion } from './DeletionPanels'
import { PriorityPanel } from './Priority'
import { TrustPanel } from './Trust'
import { StatusBadge } from './StatusBadge'
import { useReport } from './queries'
import type { Report, Status } from './types'
import { CasePanel } from './detail/CasePanel'
import { DuplicateReview } from './detail/DuplicateReview'
import { ReportFacts } from './detail/ReportFacts'
import { AddDetails, ResidentCaseNote, WhereItStands } from './detail/ResidentPanels'
import { ActionForm, StatusControls } from './detail/StatusControls'

/** What staff are told when a change goes through, and the way to the next report, from the queue around this view. */
export type StaffFlow = {
  onSaved?: (report: Report, status: Status) => void
  next?: () => void
}

/** Header for the resident sheet and staff pane: category, status, reference and date. */
export function ReportHeading({ report, id }: { report?: Report; id: string }) {
  return (
    <div className="flex items-start gap-3">
      {report && <CategoryTile category={report.resident_category} size="lg" />}
      <div className="min-w-0 flex-1">
        <h2 className="text-[22px] leading-tight font-bold">
          {report ? <Txt>{label(report.resident_category)}</Txt> : <Txt>Report details</Txt>}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted-foreground">
          {report && <StatusBadge status={report.status} />}
          <span className="font-mono">#{id.slice(0, 8).toUpperCase()}</span>
          {report?.created_at && (
            <>
              <span aria-hidden="true">·</span>
              <DateText value={report.created_at} />
            </>
          )}
        </p>
      </div>
    </div>
  )
}

/** Everything about one report. Staff also get status controls, the action log form and duplicate review. */
export function ReportView({ id, staff, flow }: { id: string; staff: boolean; flow?: StaffFlow }) {
  const t = useText()
  const report = useReport(id)
  const detail: Report | undefined = report.data
  const [imageError, setImageError] = useState(false)
  const facts = (
    <>
      {detail && !staff && <WhereItStands detail={detail} />}
      {imageError ? (
        <div className="hairline flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl bg-muted p-6 text-center text-[15px] text-muted-foreground">
          <ImageOff className="size-7" aria-hidden="true" />
          <p role="alert">
            <Txt>The photo could not be loaded. Close and reopen the report to try again.</Txt>
          </p>
        </div>
      ) : (
        <img
          className="hairline aspect-[4/3] w-full rounded-2xl bg-muted object-cover lg:aspect-[16/10]"
          src={`/api/reports/${id}/image`}
          alt={t(staff ? 'Submitted incident' : 'Photo of the reported problem')}
          onError={() => setImageError(true)}
        />
      )}
      {detail && !staff && detail.case_id && <ResidentCaseNote id={id} />}
      {detail && <ReportFacts detail={detail} />}
      {detail && !staff && !report.isPlaceholderData && !['Resolved', 'Rejected'].includes(detail.status) && (
        <AddDetails key={detail.id} id={detail.id} />
      )}
      {detail && !staff && !report.isPlaceholderData && <RequestDeletion key={`delete-${detail.id}`} detail={detail} />}
    </>
  )
  return (
    <div className={cn('grid gap-5', staff && 'xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-6')}>
      <div className="space-y-5">{facts}</div>
      {staff && (
        <div className="space-y-5 xl:sticky xl:top-4">
          {detail && !report.isPlaceholderData && <DeletionReview key={`delete-${detail.id}`} detail={detail} />}
          {/* Seed staff choices from the full report, never the list row, and reset them per report. */}
          {/* An unchecked "I see this too" gets its case decision first; the API refuses status changes until then. */}
          {detail && !report.isPlaceholderData && !(detail.case_id && !detail.case_confirmed) && (
            <StatusControls key={detail.id} detail={detail} flow={flow} />
          )}
          {detail?.priority && !report.isPlaceholderData && <PriorityPanel priority={detail.priority} />}
          {detail?.trust_flags && !report.isPlaceholderData && <TrustPanel report={detail} />}
          {detail?.case_id && <CasePanel id={id} />}
          <ActionForm id={id} />
          <DuplicateReview id={id} />
        </div>
      )}
      {shownError(report) && (
        <Alert>
          <Txt>{shownError(report)?.message ?? ''}</Txt>
        </Alert>
      )}
    </div>
  )
}
