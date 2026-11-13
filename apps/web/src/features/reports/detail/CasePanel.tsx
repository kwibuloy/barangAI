// Staff view of a grouped case and of a resident's "I see this too".
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { Txt, useText } from '../../../lib/i18n'
import { useCaseDecision, useReportCase } from '../queries'
import { Panel, fieldLabel } from './shared'

/** Staff view of a grouped case: its reports, and the decision on a resident's "I see this too". */
export function CasePanel({ id }: { id: string }) {
  const t = useText()
  const info = useReportCase(id)
  const decide = useCaseDecision(id)
  const [note, setNote] = useState('')
  const data = info.data
  if (!data) return null
  const others = (data.members ?? []).filter(member => member.id !== id)
  // A closed case takes no more reports; the API refuses, so offer only what can work.
  const caseClosed = data.status !== 'Accepted' && data.status !== 'In Progress'
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
            {(caseClosed ? (['rejected'] as const) : (['confirmed', 'rejected'] as const)).map(decision => (
              <Button
                key={decision}
                size="sm"
                variant={decision === 'confirmed' ? 'default' : 'outline'}
                type="button"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ decision, ...(note.trim() ? { note: note.trim() } : {}) })}
              >
                <Txt>
                  {decision === 'confirmed'
                    ? 'Same issue · add to case'
                    : caseClosed
                      ? 'Review on its own'
                      : 'Different issue'}
                </Txt>
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
