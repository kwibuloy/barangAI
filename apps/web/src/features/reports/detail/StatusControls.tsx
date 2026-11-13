// Staff controls: the next status on the API's path, and the action log.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert } from '@/components/page'
import { Txt, useText } from '../../../lib/i18n'
import { categories, rejectionReasons } from '../categories'
import { NOTE_PHRASES, storedNote } from '../notePhrases'
import { useChangeStatus, useLogAction } from '../queries'
import type { Category, Report, StaffAction, Status } from '../types'
import type { StaffFlow } from '../ReportDetail'
import { Panel, fieldLabel } from './shared'

/** Staff transitions follow the API's status graph; the server still enforces it. */
export function nextActions(status: Status): { label: string; status: Status }[] {
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

export const AND_NEXT: Partial<Record<Status, string>> = { Accepted: 'Accept and next', Rejected: 'Reject and next' }

export function StatusControls({ detail, flow }: { detail: Report; flow?: StaffFlow }) {
  const t = useText()
  const change = useChangeStatus(detail.id)
  const [verified, setVerified] = useState<Category>(detail.verified_category ?? detail.resident_category)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  // A colleague can move the report while this note is being written. The note was meant for the old status, so it
  // must not go out with the new buttons. A change made here is still pending when the status updates.
  const [moved, setMoved] = useState(false)
  const lastStatus = useRef(detail.status)
  useEffect(() => {
    if (detail.status === lastStatus.current) return
    lastStatus.current = detail.status
    if (!change.isPending && note.trim()) {
      setNote('')
      setReason('')
      setMoved(true)
    }
  }, [change.isPending, detail.status, note])
  const actions = nextActions(detail.status)
  const notice = moved && (
    <Alert>
      <Txt>This report just changed. Your note may not have been sent. Check the history, then write it again.</Txt>
    </Alert>
  )
  if (actions.length === 0) return notice ? <Panel title="Change status">{notice}</Panel> : null
  const described = Boolean(note.trim())
  // A phrase left as written belongs to one decision: "We confirmed this problem" must not go out with a rejection.
  const noteFor = actions.find(action => NOTE_PHRASES[action.status]?.some(item => t(item.note) === note.trim()))
  const blocked = (status: Status) =>
    change.isPending ||
    !described ||
    (status === 'Rejected' && !reason) ||
    Boolean(noteFor && noteFor.status !== status)
  function transition(status: Status, advance = false) {
    const from = detail.status
    change.mutate(
      {
        status,
        ...(status === 'Accepted' ? { verified_category: verified } : {}),
        ...(status === 'Rejected' ? { rejection_reason: reason } : {}),
        note: storedNote(note, status, t),
      },
      {
        onSuccess: () => {
          setNote('')
          flow?.onSaved?.(detail, status)
          if (advance) flow?.next?.()
        },
        // Refused because a colleague got there first: same as being moved while writing.
        onError: () => {
          if (lastStatus.current === from) return
          setNote('')
          setReason('')
          setMoved(true)
        },
      },
    )
  }
  return (
    <Panel title="Change status" className="space-y-3">
      {notice}
      {detail.status === 'Under Verification' && (
        <label className={fieldLabel}>
          <Txt>Verified category</Txt>
          <Select value={verified} onChange={event => setVerified(event.target.value as Category)}>
            {categories.map(item => (
              <option key={item.value} value={item.value}>
                <Txt>{item.label}</Txt>
              </option>
            ))}
          </Select>
        </label>
      )}
      {detail.status === 'Under Verification' && (
        <label className={fieldLabel}>
          <Txt>Reason, if rejecting</Txt>
          <Select value={reason} onChange={event => setReason(event.target.value)}>
            <option value="">{t('Choose a reason')}</option>
            {/* Rejecting moves a whole case, so "Already reported" would reject everyone's report in it. */}
            {rejectionReasons
              .filter(item => !(detail.case_id && item.value === 'already_reported'))
              .map(item => (
                <option key={item.value} value={item.value}>
                  {t(item.label)}
                </option>
              ))}
          </Select>
        </label>
      )}
      {actions.map(action => {
        const phrases = NOTE_PHRASES[action.status] ?? []
        return (
          <div key={action.status} className="space-y-1.5">
            <p className="text-[13px] font-medium text-muted-foreground">
              <Txt>{actions.length > 1 ? `Ready-made notes: ${action.label}` : 'Ready-made notes'}</Txt>
            </p>
            <div role="group" aria-label={t(action.label)} className="flex flex-wrap gap-1.5">
              {phrases.map(phrase => (
                <Button
                  key={phrase.label}
                  type="button"
                  size="xs"
                  variant="secondary"
                  className="tracking-normal normal-case"
                  onClick={() => {
                    setNote(t(phrase.note))
                    setMoved(false)
                    if (phrase.reason) setReason(phrase.reason)
                  }}
                >
                  <Txt>{phrase.label}</Txt>
                </Button>
              ))}
            </div>
          </div>
        )
      })}
      <label className={fieldLabel}>
        <Txt>Reason or description (required)</Txt>
        <Textarea
          rows={2}
          value={note}
          onChange={event => {
            setNote(event.target.value)
            setMoved(false)
          }}
          className="text-foreground"
        />
        <span className="text-[13px] font-normal text-muted-foreground">
          <Txt>The resident sees this.</Txt>
        </span>
      </label>
      {noteFor && actions.length > 1 && (
        <p className="text-[13px] text-muted-foreground">
          {t('This note is for: {action}. Change the words to use it for another choice.').replace(
            '{action}',
            t(noteFor.label),
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2 *:grow *:basis-auto">
        {actions.map(action => (
          <Button
            key={action.status}
            size="sm"
            variant={action.status === 'Rejected' ? 'destructive' : 'default'}
            type="button"
            disabled={blocked(action.status)}
            onClick={() => transition(action.status)}
          >
            <Txt>{action.label}</Txt>
          </Button>
        ))}
        {flow?.next &&
          actions.map(action => (
            <Button
              key={action.status}
              size="sm"
              variant="secondary"
              type="button"
              disabled={blocked(action.status)}
              onClick={() => transition(action.status, true)}
            >
              <Txt>{AND_NEXT[action.status] ?? 'Save and next'}</Txt>
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

export function ActionForm({ id }: { id: string }) {
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
          <Select value={kind} onChange={event => setKind(event.target.value as StaffAction['kind'])}>
            <option value="action">{t('Staff action')}</option>
            <option value="coordination">{t('External coordination')}</option>
          </Select>
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
