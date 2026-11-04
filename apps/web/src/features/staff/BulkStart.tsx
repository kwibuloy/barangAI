import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { post } from '../../lib/api'
import { Txt, useText } from '../../lib/i18n'
import { NOTE_PHRASES, storedNote } from '../reports/notePhrases'
import { reportKeys } from '../reports/queries'

type Failure = { id: string; message: string }

/** Moves several Pending reports to Under Verification with one note. Each goes through the same status route as a
    single change, so the API's checks and history apply to each, and one refusal never hides the others. */
export function BulkStart({
  selected,
  onFinished,
  onCancel,
}: {
  selected: string[]
  onFinished: (done: string[]) => void
  onCancel: () => void
}) {
  const t = useText()
  const client = useQueryClient()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState<Failure[]>([])
  const [message, setMessage] = useState('')
  async function start() {
    setBusy(true)
    setFailures([])
    setMessage('')
    const done: string[] = []
    const failed: Failure[] = []
    for (const id of selected) {
      try {
        await post(`/reports/${id}/status`, {
          status: 'Under Verification',
          note: storedNote(note, 'Under Verification', t),
        })
        done.push(id)
      } catch (error) {
        failed.push({ id, message: (error as Error).message })
      }
    }
    await client.invalidateQueries({ queryKey: reportKeys.all })
    setBusy(false)
    setFailures(failed)
    setMessage(done.length ? `${t('Verification started on')} ${done.length} ${t('reports')}.` : '')
    if (!failed.length) setNote('')
    onFinished(done)
  }
  return (
    <section
      aria-label={t('Start verification on several reports')}
      className="hairline m-3 space-y-2.5 rounded-2xl bg-card p-3"
    >
      <p className="text-[14px] font-bold">
        {selected.length} {t('selected')}
      </p>
      <div role="group" aria-label={t('Ready-made notes')} className="flex flex-wrap gap-1.5">
        {/* Only what is true of a report nobody has opened yet, so not the promise of a visit. */}
        {(NOTE_PHRASES['Under Verification'] ?? []).slice(0, 1).map(phrase => (
          <Button
            key={phrase.label}
            type="button"
            size="xs"
            variant="secondary"
            className="tracking-normal normal-case"
            onClick={() => setNote(t(phrase.note))}
          >
            <Txt>{phrase.label}</Txt>
          </Button>
        ))}
      </div>
      <label className="block space-y-1.5 text-[13px] font-medium text-muted-foreground">
        <Txt>Note for all of them (required)</Txt>
        <Textarea
          rows={2}
          maxLength={2000}
          value={note}
          onChange={event => setNote(event.target.value)}
          className="text-foreground"
        />
        <span className="font-normal">
          <Txt>The residents see this.</Txt>
        </span>
      </label>
      <div className="flex flex-wrap gap-2 *:grow *:basis-auto">
        <Button
          type="button"
          size="sm"
          disabled={busy || !note.trim() || selected.length === 0}
          onClick={() => void start()}
        >
          <Txt>Start verification</Txt>
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
          <Txt>Cancel</Txt>
        </Button>
      </div>
      <p role="status" className="text-[14px] font-medium text-[var(--status-resolved)]">
        {message}
      </p>
      {failures.length > 0 && (
        <Alert>
          <Txt>These did not move:</Txt>
          {failures.map(item => (
            <span key={item.id} className="block break-words">
              #{item.id.slice(0, 8).toUpperCase()}: {t(item.message)}
            </span>
          ))}
        </Alert>
      )}
    </section>
  )
}
