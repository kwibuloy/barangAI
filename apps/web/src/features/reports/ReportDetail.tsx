import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ImagePlus,
  ImageOff,
  Layers,
  LoaderCircle,
  MapPin,
  MessageSquarePlus,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import { categories, hazardLabels, label } from './categories'
import { CategoryTile } from './CategoryIcon'
import { DeletionReview, RequestDeletion } from './DeletionPanels'
import { compressPhoto } from './photo'
import { PriorityPanel } from './Priority'
import { TrustPanel } from './Trust'
import { STATUS_STYLE, StatusBadge } from './StatusBadge'
import {
  useCaseDecision,
  useChangeStatus,
  useDecideDuplicate,
  useDuplicates,
  useGenerateDuplicates,
  useLinkReports,
  useAddDetails,
  useLogAction,
  useReport,
  useReportCase,
} from './queries'
import type { Category, Duplicate, Report, StaffAction, Status } from './types'

/** Staff transitions follow the API's status graph; the server still enforces it. */
function nextActions(status: Status): { label: string; status: Status }[] {
  switch (status) {
    case 'Pending':
      return [{ label: 'Start verification', status: 'Under Verification' }]
    case 'Under Verification':
      return [
        { label: 'Accept report', status: 'Accepted' },
        { label: 'Reject report', status: 'Rejected' },
      ]
    case 'Accepted':
      return [{ label: 'Mark in progress', status: 'In Progress' }]
    case 'In Progress':
      return [{ label: 'Mark resolved', status: 'Resolved' }]
    default:
      return []
  }
}

function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('hairline rounded-2xl bg-card p-5', className)}>
      {title && (
        <h3 className="mb-3 text-[15px] font-semibold">
          <Txt>{title}</Txt>
        </h3>
      )}
      {children}
    </section>
  )
}

const fieldLabel = 'block space-y-1.5 text-[13px] font-medium text-muted-foreground'

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
export function ReportView({ id, staff }: { id: string; staff: boolean }) {
  const t = useText()
  const report = useReport(id)
  const detail: Report | undefined = report.data
  const me = useMe()
  const [imageError, setImageError] = useState(false)
  const facts = (
    <>
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
          alt={t('Submitted incident')}
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
          {detail && !report.isPlaceholderData && (
            <DeletionReview key={`delete-${detail.id}`} detail={detail} canDecide={me.data?.role === 'administrator'} />
          )}
          {/* Seed staff choices from the full report, never the list row, and reset them per report. */}
          {/* An unchecked "I see this too" gets its case decision first; the API refuses status changes until then. */}
          {detail && !report.isPlaceholderData && !(detail.case_id && !detail.case_confirmed) && (
            <StatusControls key={detail.id} detail={detail} />
          )}
          {detail?.priority && !report.isPlaceholderData && <PriorityPanel priority={detail.priority} />}
          {detail?.trust_flags && !report.isPlaceholderData && <TrustPanel report={detail} />}
          {detail?.case_id && <CasePanel id={id} />}
          <ActionForm id={id} />
          <DuplicateReview id={id} />
        </div>
      )}
      {report.error && (
        <Alert>
          <Txt>{report.error.message}</Txt>
        </Alert>
      )}
    </div>
  )
}

function ReportFacts({ detail }: { detail: Report }) {
  const t = useText()
  const history = detail.events ?? [{ to_status: detail.status, created_at: detail.created_at }]
  return (
    <>
      {/* Three separate fields: what the resident chose, what the model guessed, what staff confirmed. */}
      <dl className="hairline grid grid-cols-3 divide-x rounded-2xl bg-card">
        {[
          { term: 'Resident category', value: detail.resident_category },
          { term: 'AI suggestion', value: detail.model_category, ai: true },
          { term: 'Verified category', value: detail.verified_category },
        ].map(item => (
          <div key={item.term} className="min-w-0 p-3">
            <dt className="flex items-center gap-1 text-[12px] leading-tight text-muted-foreground">
              {item.ai && <Sparkles className="size-3 shrink-0" aria-hidden="true" />}
              <Txt>{item.term}</Txt>
            </dt>
            <dd className={cn('mt-1 text-[15px] leading-snug font-semibold', !item.value && 'text-muted-foreground')}>
              <Txt>{label(item.value)}</Txt>
            </dd>
          </div>
        ))}
      </dl>
      {detail.hazards && detail.hazards.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          <Txt>The AI noticed:</Txt>
          {detail.hazards.map(hazard => (
            <span
              key={hazard}
              className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--status-progress)_13%,transparent)] px-2 py-0.5 font-medium text-[var(--status-progress)]"
            >
              <TriangleAlert className="size-3" aria-hidden="true" />
              <Txt>{hazardLabels[hazard] ?? hazard}</Txt>
            </span>
          ))}
        </p>
      )}
      {(detail.description || detail.latitude != null) && (
        <Panel>
          {detail.description && <p className="text-[16px]">{detail.description}</p>}
          {detail.latitude != null && detail.longitude != null && (
            <p
              className={cn(
                'flex items-start gap-1.5 text-[14px] text-muted-foreground',
                detail.description && 'mt-3 border-t pt-3',
              )}
            >
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {detail.location_label && (
                  <span className="block font-medium text-foreground">{detail.location_label}</span>
                )}
                <span className="font-mono">
                  {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
                </span>
              </span>
            </p>
          )}
        </Panel>
      )}
      {detail.addenda && detail.addenda.length > 0 && (
        <Panel title="Added later by the resident">
          <ol className="space-y-3">
            {detail.addenda.map(item => (
              <li key={item.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <small className="text-[13px] text-muted-foreground">
                  <DateText value={item.created_at} />
                </small>
                <p className="mt-1 text-[15px] break-words">{item.note}</p>
                {item.image_url && (
                  <img
                    className="hairline mt-2 aspect-[4/3] w-full max-w-sm rounded-xl bg-muted object-cover"
                    src={item.image_url}
                    alt={t('Photo added later')}
                  />
                )}
              </li>
            ))}
          </ol>
        </Panel>
      )}
      <Panel title="Status history">
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
          {history.map((event, index) => {
            const style = event.to_status ? STATUS_STYLE[event.to_status] : undefined
            return (
              <li key={event.id ?? index} className="relative pl-6">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-card"
                  style={{ backgroundColor: style?.color ?? 'var(--muted-foreground)' }}
                />
                <strong className="block text-[15px] font-semibold">
                  <Txt>{event.to_status ?? 'Update'}</Txt>
                </strong>
                <small className="text-[13px] text-muted-foreground">
                  {event.created_at ? <DateText value={event.created_at} /> : t('Recorded')}
                </small>
                {event.note && <p className="mt-1 text-[15px]">{event.note}</p>}
              </li>
            )
          })}
        </ol>
      </Panel>
      {detail.actions && detail.actions.length > 0 && (
        <Panel title="Action log">
          <ol className="space-y-3">
            {detail.actions.map(action => (
              <li key={action.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <strong className="block text-[15px] font-semibold">
                  <Txt>
                    {action.kind === 'coordination'
                      ? 'External coordination'
                      : action.kind === 'system'
                        ? 'Automatic note'
                        : 'Staff action'}
                  </Txt>
                </strong>
                <small className="text-[13px] text-muted-foreground">
                  <DateText value={action.created_at} />
                </small>
                <p className="mt-1 text-[15px]">{action.note}</p>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  )
}

function StatusControls({ detail }: { detail: Report }) {
  const change = useChangeStatus(detail.id)
  const [verified, setVerified] = useState<Category>(detail.verified_category ?? detail.resident_category)
  const [note, setNote] = useState('')
  const actions = nextActions(detail.status)
  if (actions.length === 0) return null
  function transition(status: Status) {
    change.mutate(
      {
        status,
        ...(status === 'Accepted' ? { verified_category: verified } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: () => setNote('') },
    )
  }
  return (
    <Panel title="Change status" className="space-y-3">
      {detail.status === 'Under Verification' && (
        <label className={fieldLabel}>
          <Txt>Verified category</Txt>
          <NativeSelect value={verified} onChange={event => setVerified(event.target.value as Category)}>
            {categories.map(item => (
              <option key={item.value} value={item.value}>
                <Txt>{item.label}</Txt>
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <label className={fieldLabel}>
        <Txt>Status note (optional)</Txt>
        <Textarea rows={2} value={note} onChange={event => setNote(event.target.value)} className="text-foreground" />
      </label>
      <div className="flex flex-wrap gap-2">
        {actions.map(action => (
          <Button
            key={action.status}
            size="sm"
            variant={action.status === 'Rejected' ? 'destructive' : 'default'}
            className="flex-1"
            type="button"
            disabled={change.isPending}
            onClick={() => transition(action.status)}
          >
            <Txt>{action.label}</Txt>
          </Button>
        ))}
      </div>
      {change.error && (
        <Alert>
          <Txt>{change.error.message}</Txt>
        </Alert>
      )}
    </Panel>
  )
}

function ActionForm({ id }: { id: string }) {
  const t = useText()
  const log = useLogAction(id)
  const [kind, setKind] = useState<StaffAction['kind']>('action')
  const [note, setNote] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!note.trim()) return
    log.mutate({ kind, note: note.trim() }, { onSuccess: () => setNote('') })
  }
  return (
    <form onSubmit={submit}>
      <Panel title="Document work" className="space-y-3">
        <label className={fieldLabel}>
          <Txt>Record type</Txt>
          <NativeSelect value={kind} onChange={event => setKind(event.target.value as StaffAction['kind'])}>
            <option value="action">{t('Staff action')}</option>
            <option value="coordination">{t('External coordination')}</option>
          </NativeSelect>
        </label>
        <label className={fieldLabel}>
          <Txt>Note</Txt>
          <Textarea
            required
            rows={3}
            maxLength={2000}
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={t('What was done, or which office was contacted?')}
            className="text-foreground"
          />
        </label>
        <Button variant="tinted" size="sm" className="w-full" type="submit" disabled={log.isPending}>
          <Txt>Save action</Txt>
        </Button>
        {log.error && (
          <Alert>
            <Txt>{log.error.message}</Txt>
          </Alert>
        )}
      </Panel>
    </form>
  )
}

function DuplicateReview({ id }: { id: string }) {
  const t = useText()
  const duplicates = useDuplicates(id, true)
  const generate = useGenerateDuplicates(id)
  const decide = useDecideDuplicate()
  const link = useLinkReports()
  const inCase = new Set(useReportCase(id).data?.members?.map(member => member.id))
  // One draft note per suggestion, so text typed under one never goes out with another.
  const [notes, setNotes] = useState<Record<string, string>>({})
  const busy = generate.isPending || decide.isPending || link.isPending
  const error = duplicates.error ?? generate.error ?? decide.error ?? link.error
  const group = (item: Duplicate) => link.mutate({ report_id: id, other_report_id: item.candidate_report_id })
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
              <strong className="block text-[14px]">
                <Txt>Report</Txt> {item.candidate_report_id.slice(0, 8)}
              </strong>
              <small className="block text-[13px] text-muted-foreground">
                <Txt>Similarity score</Txt> {item.score.toFixed(2)} · <Txt>{item.decision}</Txt>
              </small>
              {item.decision === 'confirmed' && inCase.has(item.candidate_report_id) && (
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-primary">
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

/** Resident view: their report is part of a case, with how many residents reported it. Never other reports. */
function ResidentCaseNote({ id }: { id: string }) {
  const t = useText()
  const info = useReportCase(id).data
  if (!info) return null
  return (
    <p className="flex items-start gap-2.5 rounded-2xl bg-tint p-3.5 text-[14.5px]">
      <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        {info.confirmed && info.contributors == null ? (
          <Txt>Staff have grouped your report with others about the same issue.</Txt>
        ) : info.confirmed ? (
          <>
            <strong className="font-semibold">
              {info.contributors} {t(info.contributors === 1 ? 'resident reported this' : 'residents reported this')}
            </strong>
            <span className="block text-muted-foreground">
              <Txt>The barangay handles these reports together as one case.</Txt>
            </span>
          </>
        ) : (
          <Txt>You added this to a reported issue. Barangay staff will check that it is the same one.</Txt>
        )}
      </span>
    </p>
  )
}

/** Staff view of a grouped case: its reports, and the decision on a resident's "I see this too". */
function CasePanel({ id }: { id: string }) {
  const t = useText()
  const info = useReportCase(id)
  const decide = useCaseDecision(id)
  const [note, setNote] = useState('')
  const data = info.data
  if (!data) return null
  const others = (data.members ?? []).filter(member => member.id !== id)
  return (
    <Panel title="Grouped case" className="space-y-3">
      <p className="text-[14px] text-muted-foreground">
        <span className="font-mono">#{data.id.slice(0, 8).toUpperCase()}</span> · {data.reports} {t('reports')} ·{' '}
        {data.contributors} {t('residents')}
        {data.status && (
          <>
            {' · '}
            <Txt>{data.status}</Txt>
          </>
        )}
      </p>
      {data.confirmed ? (
        <p className="text-[14px] text-muted-foreground">
          <Txt>Status changes here apply to every report in the case.</Txt>
        </p>
      ) : (
        <div className="space-y-2 rounded-xl bg-muted p-3">
          <p className="text-[14px]">
            <Txt>The resident says this is the same issue. Check before changing its status.</Txt>
          </p>
          <label className={fieldLabel}>
            <Txt>Decision note (optional)</Txt>
            <Input
              maxLength={2000}
              value={note}
              onChange={event => setNote(event.target.value)}
              className="h-9 text-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['confirmed', 'rejected'] as const).map(decision => (
              <Button
                key={decision}
                size="sm"
                variant={decision === 'confirmed' ? 'default' : 'outline'}
                type="button"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ decision, ...(note.trim() ? { note: note.trim() } : {}) })}
              >
                <Txt>{decision === 'confirmed' ? 'Same issue · add to case' : 'Different issue'}</Txt>
              </Button>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <ul className="space-y-1">
          {others.map(member => (
            <li key={member.id}>
              <Link
                to={`/desk/reports/${member.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[14px] transition-colors hover:bg-accent"
              >
                <span className="font-mono">#{member.id.slice(0, 8).toUpperCase()}</span>
                <span className="text-muted-foreground">
                  {member.confirmed ? <Txt>{member.status}</Txt> : <Txt>To check</Txt>} ·{' '}
                  <DateText value={member.created_at} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(decide.error ?? info.error) && (
        <Alert>
          <Txt>{(decide.error ?? info.error)!.message}</Txt>
        </Alert>
      )}
    </Panel>
  )
}

/** Resident: add a note (and optionally another photo) to their own open report. The original never changes. */
function AddDetails({ id }: { id: string }) {
  const t = useText()
  const add = useAddDetails(id)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [done, setDone] = useState(false)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!note.trim()) return
    const form = new FormData()
    form.set('note', note.trim())
    if (photo) form.set('image', photo)
    add.mutate(form, {
      onSuccess: () => {
        setNote('')
        setPhoto(null)
        setOpen(false)
        setDone(true)
      },
    })
  }
  if (!open)
    return (
      <div className="space-y-2">
        {done && (
          <p role="status" className="text-[14px] text-[var(--status-resolved)]">
            <Txt>Added. Barangay staff were notified.</Txt>
          </p>
        )}
        <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          <MessageSquarePlus />
          <Txt>Add details</Txt>
        </Button>
      </div>
    )
  return (
    <Panel title="Add details">
      <form className="space-y-3" onSubmit={submit}>
        <p className="text-[14px] text-muted-foreground">
          <Txt>Your first report stays as it is. Staff see what you add, with the time you added it.</Txt>
        </p>
        <Textarea
          id="addendum-note"
          value={note}
          maxLength={1000}
          rows={3}
          placeholder={t('What changed? For example: the water is higher now.')}
          onChange={event => setNote(event.target.value)}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-medium text-primary">
          <ImagePlus className="size-5" aria-hidden="true" />
          <span className="truncate">{photo ? photo.name : t('Add a photo (optional)')}</span>
          <input
            id="addendum-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void compressPhoto(file).then(setPhoto)
            }}
          />
        </label>
        {add.error && (
          <Alert>
            <Txt>{add.error.message}</Txt>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            <Txt>Cancel</Txt>
          </Button>
          <Button type="submit" className="flex-1" disabled={!note.trim() || add.isPending}>
            {add.isPending && <LoaderCircle className="animate-spin" />}
            <Txt>Send to staff</Txt>
          </Button>
        </div>
      </form>
    </Panel>
  )
}
