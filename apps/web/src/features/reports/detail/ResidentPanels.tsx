// What a resident sees of their own report: where it stands, a grouped case, and adding details.
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ImagePlus, LoaderCircle, MessageSquarePlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert } from '@/components/page'
import { Journey } from '../Journey'
import { Txt, useText } from '../../../lib/i18n'
import { rejectionReasons } from '../categories'
import { compressPhoto } from '../photo'
import { useAddDetails, useReportCase } from '../queries'
import type { FollowUp, Report, Status } from '../types'
import { Panel } from './shared'

/** One line per status on what comes next. Never a date: nothing here promises when. */
export const WHAT_NEXT: Record<Status, string> = {
  Pending: 'Barangay staff will look at your report next. You will see updates here.',
  'Under Verification': 'Staff are checking your report. Next they accept it or tell you why not.',
  Accepted: 'Staff accepted this report. It moves to In Progress when work starts.',
  'In Progress': 'Work has started. Staff mark it Resolved when it is done.',
  Resolved: 'Staff marked this as fixed. Thank you for reporting.',
  Rejected: 'Staff did not accept this report. If the problem is still there, you can make a new report.',
}

// cases.py's GROUPED_NOTE: written by the app when a report joins a case, so history shows it but it isn't staff's.

export const GROUPED_NOTE = 'Your report was grouped with others about the same concern, so it now shares their status.'

/** The newest note a resident may read: a status description or a staff action. The API sends them no others. */
export function latestStaffNote(detail: Report) {
  const notes = [
    ...(detail.events ?? []).map(event => ({ note: event.note, at: event.created_at })),
    ...(detail.actions ?? []).filter(action => action.kind === 'action').map(a => ({ note: a.note, at: a.created_at })),
  ].filter(item => item.note && item.note !== GROUPED_NOTE && item.at)
  notes.sort((first, second) => String(first.at).localeCompare(String(second.at)))
  return notes.at(-1)?.note ?? null
}

/** Top of a resident's report: where it is on the path, what staff last said and what happens next. */
export function WhereItStands({ detail }: { detail: Report }) {
  const t = useText()
  const note = latestStaffNote(detail)
  const reason = [...(detail.events ?? [])].reverse().find(event => event.rejection_reason)?.rejection_reason
  const moving = detail.status !== 'Resolved' && detail.status !== 'Rejected'
  const followUp: FollowUp | null =
    detail.latitude != null && detail.longitude != null
      ? {
          reportId: detail.id,
          category: detail.verified_category ?? detail.resident_category,
          latitude: detail.latitude,
          longitude: detail.longitude,
        }
      : null
  return (
    <section className="hairline space-y-3 rounded-2xl bg-card p-4">
      <Journey status={detail.status} compact className={moving ? 'mt-9' : undefined} />
      {detail.status === 'Rejected' && reason && (
        <div className="border-t-2 pt-3">
          <h3 className="text-[13px] text-muted-foreground">
            <Txt>Reason from staff</Txt>
          </h3>
          <p className="text-[15px] font-bold">
            <Txt>{rejectionReasons.find(item => item.value === reason)?.label ?? 'Other reason'}</Txt>
          </p>
        </div>
      )}
      {note && (
        <div className="border-t-2 pt-3">
          <h3 className="text-[13px] text-muted-foreground">
            <Txt>Latest note from staff</Txt>
          </h3>
          <p className="text-[15px] break-words">{t(note)}</p>
        </div>
      )}
      <div className="border-t-2 pt-3">
        <h3 className="text-[13px] text-muted-foreground">
          <Txt>What happens next</Txt>
        </h3>
        <p className="text-[15px]">
          <Txt>{WHAT_NEXT[detail.status]}</Txt>
        </p>
      </div>
      {detail.status === 'Rejected' && (
        <Button asChild variant="tinted" className="w-full">
          <Link to="/report">
            <Txt>Make a new report</Txt>
          </Link>
        </Button>
      )}
      {/* A new report that names this one in its text. Nothing reopens, and the status path stays as it is. */}
      {detail.status === 'Resolved' && (
        <Button asChild variant="tinted" className="w-full">
          <Link to="/report" state={followUp ? { followUp } : undefined}>
            <Txt>Still not fixed? Report it again</Txt>
          </Link>
        </Button>
      )}
    </section>
  )
}

/** Resident view: their report is part of a case, with how many residents reported it. Never other reports. */
export function ResidentCaseNote({ id }: { id: string }) {
  const t = useText()
  const info = useReportCase(id).data
  if (!info) return null
  return (
    <p className="flex items-start gap-2.5 rounded-2xl bg-tint p-3.5 text-[14.5px]">
      <Users className="mt-0.5 size-4 shrink-0 text-link" aria-hidden="true" />
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

/** Resident: add a note (and optionally another photo) to their own open report. The original never changes. */
export function AddDetails({ id }: { id: string }) {
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
        <label htmlFor="addendum-note" className="sr-only">
          <Txt>Add details</Txt>
        </label>
        <Textarea
          id="addendum-note"
          value={note}
          maxLength={1000}
          rows={3}
          placeholder={t('What changed? For example: the water is higher now.')}
          onChange={event => setNote(event.target.value)}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-medium text-link">
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            <Txt>Cancel</Txt>
          </Button>
          <Button type="submit" className="grow basis-auto" disabled={!note.trim() || add.isPending}>
            {add.isPending && <LoaderCircle className="animate-spin" />}
            <Txt>Send to staff</Txt>
          </Button>
        </div>
      </form>
    </Panel>
  )
}
