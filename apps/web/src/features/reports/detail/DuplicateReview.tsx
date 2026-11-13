// Staff compare a suggested duplicate side by side and decide; grouping can ask first.
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { ApiError } from '../../../lib/api'
import { Txt, useText } from '../../../lib/i18n'
import { label } from '../categories'
import { StatusBadge } from '../StatusBadge'
import { useDecideDuplicate, useDuplicates, useGenerateDuplicates, useLinkReports, useReportCase } from '../queries'
import type { Category, Duplicate, ReportSummary } from '../types'
import { Panel, fieldLabel } from './shared'

/** One side of the comparison. Says whose category it is: staff's once verified, otherwise the resident's. */
export function CompareSide({ title, report, link }: { title: string; report: ReportSummary; link?: string }) {
  const t = useText()
  const category = report.verified_category ?? report.resident_category
  return (
    <div className="min-w-0 space-y-1.5 text-[13px]">
      <strong className="block text-[13px] font-bold break-words">{title}</strong>
      <img
        src={report.image_url}
        alt={`${title}: ${t(label(category))}`}
        loading="lazy"
        decoding="async"
        className="hairline aspect-[4/3] w-full rounded-xl bg-muted object-cover"
      />
      {/* Half a narrow panel: the badge wraps here rather than running into the other report's. */}
      <StatusBadge status={report.status} className="h-auto max-w-full py-0.5 leading-tight whitespace-normal" />
      <p className="break-words">
        <span className="text-muted-foreground">
          <Txt>{report.verified_category ? 'Verified:' : 'Resident chose:'}</Txt>
        </span>{' '}
        <span className="font-semibold">
          <Txt>{label(category)}</Txt>
        </span>
      </p>
      <p className="text-muted-foreground">
        <DateText value={report.created_at} />
      </p>
      {report.location_label && <p className="break-words text-muted-foreground">{report.location_label}</p>}
      {link && (
        <Link to={link} className="inline-flex min-h-8 items-center font-bold text-link">
          <Txt>Open report</Txt>
        </Link>
      )}
    </div>
  )
}

export type LinkCheck = { reasons: string[]; distance_m: number; categories: Category[] }

export const linkCheckOf = (error: unknown) => {
  const detail = error instanceof ApiError ? (error.detail as (LinkCheck & { code?: string }) | undefined) : undefined
  return detail && typeof detail === 'object' && detail.code === 'confirm_far' ? detail : null
}

export function DuplicateReview({ id }: { id: string }) {
  const t = useText()
  const { search } = useLocation()
  const duplicates = useDuplicates(id, true)
  const generate = useGenerateDuplicates(id)
  const decide = useDecideDuplicate()
  const link = useLinkReports()
  const inCase = new Set(useReportCase(id).data?.members?.map(member => member.id))
  // One draft note per suggestion, so text typed under one never goes out with another.
  const [notes, setNotes] = useState<Record<string, string>>({})
  // Grouping can't be undone, so a pair that looks like a mis-click comes back with what to check before asking again.
  const [check, setCheck] = useState<{ item: Duplicate; details: LinkCheck } | null>(null)
  const busy = generate.isPending || decide.isPending || link.isPending
  const error = duplicates.error ?? generate.error ?? decide.error ?? (linkCheckOf(link.error) ? null : link.error)
  const group = (item: Duplicate, confirmFar = false) =>
    link.mutate(
      { report_id: id, other_report_id: item.candidate_report_id, ...(confirmFar ? { confirm_far: true } : {}) },
      {
        onSuccess: () => setCheck(null),
        onError: failure => {
          const details = linkCheckOf(failure)
          setCheck(details ? { item, details } : null)
        },
      },
    )
  function decideOn(item: Duplicate, decision: 'confirmed' | 'rejected') {
    decide.mutate(
      { id: item.id, decision, note: notes[item.id]?.trim() || undefined },
      {
        onSuccess: () => {
          setNotes(current => ({ ...current, [item.id]: '' }))
          // The same incident becomes one case on the dashboard; each report keeps its own photo and history.
          if (decision === 'confirmed') group(item)
        },
      },
    )
  }
  const result = duplicates.data
  return (
    <Panel title="Potential duplicates" className="space-y-3">
      {result?.embedding_available === false ? (
        <p className="text-[14px] text-muted-foreground">
          <Txt>
            Duplicate suggestions unavailable. Review nearby reports manually until a validated image embedding model is
            connected.
          </Txt>
        </p>
      ) : result?.embedding_available ? (
        <>
          <p className="text-[14px] text-muted-foreground">
            <Txt>Suggestions need a staff decision. Original submissions remain separate.</Txt>
          </p>
          <Button variant="tinted" size="sm" type="button" disabled={busy} onClick={() => generate.mutate()}>
            <Txt>Check for suggestions</Txt>
          </Button>
          {result.suggestions.length === 0 && (
            <p className="text-[14px] text-muted-foreground">
              <Txt>No suggestions found.</Txt>
            </p>
          )}
          {result.suggestions.map(item => (
            <div className="space-y-2 rounded-xl bg-muted p-3" key={item.id}>
              {!item.candidate && (
                <strong className="block text-[14px]">
                  <Txt>Report</Txt> {item.candidate_report_id.slice(0, 8)}
                </strong>
              )}
              {result.report && item.candidate && (
                <div className="grid grid-cols-2 gap-2.5">
                  <CompareSide title={t('This report')} report={result.report} />
                  <CompareSide
                    title={`#${item.candidate.id.slice(0, 8).toUpperCase()}`}
                    report={item.candidate}
                    link={`/desk/reports/${item.candidate.id}${search}`}
                  />
                </div>
              )}
              <small className="block text-[13px] text-muted-foreground">
                {item.distance_m != null && (
                  <>
                    {t('{n} m apart').replace('{n}', String(item.distance_m))}
                    {' · '}
                  </>
                )}
                <Txt>Similarity score</Txt> {item.score.toFixed(2)} · <Txt>{item.decision}</Txt>
              </small>
              {item.decision === 'confirmed' && inCase.has(item.candidate_report_id) && (
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-link">
                  <Layers className="size-3.5" aria-hidden="true" />
                  <Txt>In this case</Txt>
                </p>
              )}
              {item.decision === 'confirmed' && !inCase.has(item.candidate_report_id) && (
                <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={() => group(item)}>
                  <Layers />
                  <Txt>Group into one case</Txt>
                </Button>
              )}
              {check?.item.id === item.id && (
                <div role="alert" className="space-y-2 rounded-xl bg-card p-3 text-[14px]">
                  <strong className="block font-bold">
                    <Txt>Check before grouping. This can't be undone.</Txt>
                  </strong>
                  {check.details.reasons.includes('far') && (
                    <p>{t('These reports are {n} m apart.').replace('{n}', String(check.details.distance_m))}</p>
                  )}
                  {check.details.reasons.includes('category') && (
                    <p>
                      <Txt>Their categories differ:</Txt>{' '}
                      {check.details.categories.map(category => t(label(category))).join(' / ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" type="button" disabled={busy} onClick={() => group(item, true)}>
                      <Txt>Group them anyway</Txt>
                    </Button>
                    <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={() => setCheck(null)}>
                      <Txt>Cancel</Txt>
                    </Button>
                  </div>
                </div>
              )}
              {item.decision === 'pending' && (
                <>
                  <label className={fieldLabel}>
                    <Txt>Decision note (optional)</Txt>
                    <Input
                      maxLength={2000}
                      value={notes[item.id] ?? ''}
                      onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))}
                      className="h-9 text-foreground"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" type="button" disabled={busy} onClick={() => decideOn(item, 'confirmed')}>
                      <Txt>Confirm same incident</Txt>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => decideOn(item, 'rejected')}
                    >
                      <Txt>Not duplicate</Txt>
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      ) : (
        <div role="status" className="shimmer h-10 rounded-xl">
          <span className="sr-only">{t('Loading duplicate review…')}</span>
        </div>
      )}
      {error && (
        <Alert>
          <Txt>{error.message}</Txt>
        </Alert>
      )}
    </Panel>
  )
}
