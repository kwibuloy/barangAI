import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Txt, useText } from '../../lib/i18n'
import { useDecideDeletion, useRequestDeletion } from './queries'
import type { Report } from './types'

/** A resident asks an administrator to delete this report. */
export function RequestDeletion({ detail }: { detail: Report }) {
  const t = useText()
  const send = useRequestDeletion(detail.id)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const current = detail.deletion_request
  if (current?.status === 'pending')
    return (
      <p role="status" className="px-1 text-[14px] text-muted-foreground">
        <Txt>You asked for this report to be deleted. An administrator will review it.</Txt>
      </p>
    )
  function submit(event: FormEvent) {
    event.preventDefault()
    send.mutate(reason.trim(), { onSuccess: () => setOpen(false) })
  }
  return (
    <div className="space-y-2 px-1">
      {current?.status === 'declined' && (
        <p className="text-[14px]">
          <Txt>An administrator declined your deletion request.</Txt>
          {current.note ? ` ${current.note}` : ''}
        </p>
      )}
      {open ? (
        <form onSubmit={submit} className="space-y-2">
          <label className="block space-y-1.5 text-[14px] font-medium">
            <span>
              <Txt>Why should it be deleted? (optional)</Txt>
            </span>
            <Textarea
              rows={2}
              maxLength={500}
              value={reason}
              placeholder={t('For example: my face or house is visible in the photo.')}
              onChange={event => setReason(event.target.value)}
            />
          </label>
          {send.error && (
            <Alert>
              <Txt>{send.error.message}</Txt>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2 *:grow *:basis-auto">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <Txt>Cancel</Txt>
            </Button>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending && <LoaderCircle className="animate-spin" />}
              <Txt>Send request</Txt>
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="min-h-11 text-[14px] font-medium text-muted-foreground underline underline-offset-2"
          onClick={() => setOpen(true)}
        >
          <Txt>Ask to delete this report</Txt>
        </button>
      )}
    </div>
  )
}

/** Shown to administrators while a resident's deletion request waits. Staff see that it exists. */
export function DeletionReview({ detail, canDecide }: { detail: Report; canDecide: boolean }) {
  const decide = useDecideDeletion(detail.id)
  const navigate = useNavigate()
  const [note, setNote] = useState('')
  const current = detail.deletion_request
  if (current?.status !== 'pending') return null
  return (
    <section className="hairline space-y-3 rounded-2xl bg-card p-5">
      <h3 className="text-[15px] font-semibold">
        <Txt>The resident asked to delete this report</Txt>
      </h3>
      {current.reason && <p className="text-[15px]">{current.reason}</p>}
      {canDecide ? (
        <>
          <p className="text-[14px] text-muted-foreground">
            <Txt>Approving permanently deletes the report, its photos and its history.</Txt>
          </p>
          <label className="block space-y-1.5 text-[13px] font-medium text-muted-foreground">
            <span>
              <Txt>Note to the resident if you decline (optional)</Txt>
            </span>
            <Textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
          </label>
          {decide.error && (
            <Alert>
              <Txt>{decide.error.message}</Txt>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2 *:grow *:basis-auto">
            <Button
              variant="outline"

              disabled={decide.isPending}
              onClick={() => decide.mutate({ decision: 'declined', note: note.trim() || undefined })}
            >
              <Txt>Decline</Txt>
            </Button>
            <Button
              variant="destructive"

              disabled={decide.isPending}
              onClick={() => decide.mutate({ decision: 'approved' }, { onSuccess: () => navigate('/desk/reports') })}
            >
              <Txt>Approve and delete</Txt>
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[14px] text-muted-foreground">
          <Txt>An administrator will decide.</Txt>
        </p>
      )}
    </section>
  )
}
