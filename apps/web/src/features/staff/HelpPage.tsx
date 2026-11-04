import { useState, type FormEvent, type ReactNode } from 'react'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Txt, useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import { useFeedbackNotes, useOperator, useSendFeedback } from './queries'

const MAX_FEEDBACK = 1000

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <Txt>{title}</Txt>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-[15px]">{children}</CardContent>
    </Card>
  )
}

function FeedbackForm() {
  const t = useText()
  const send = useSendFeedback()
  const [message, setMessage] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    send.mutate(message.trim(), { onSuccess: () => setMessage('') })
  }
  return (
    <form onSubmit={submit} className="space-y-2.5">
      <label className="block space-y-1.5 text-[14px] font-medium">
        <span>
          <Txt>What should work better?</Txt>
        </span>
        <Textarea
          rows={3}
          required
          maxLength={MAX_FEEDBACK}
          value={message}
          onChange={event => setMessage(event.target.value)}
        />
      </label>
      <p className="text-[13px] text-muted-foreground">
        <Txt>Your administrator reads this with your account number. Leave out residents' names and details.</Txt>{' '}
        {message.length}/{MAX_FEEDBACK}
      </p>
      <Button type="submit" className="w-full" disabled={send.isPending || !message.trim()}>
        <Txt>Send feedback</Txt>
      </Button>
      {send.error && (
        <Alert>
          <Txt>{send.error.message}</Txt>
        </Alert>
      )}
      <p role="status" className="text-[14px] font-medium text-[var(--status-resolved)]">
        {send.isSuccess && t('Thank you. Your feedback was sent.')}
      </p>
    </form>
  )
}

function FeedbackList() {
  const notes = useFeedbackNotes(true)
  return (
    <Topic title="Feedback received">
      {notes.error && (
        <Alert>
          <Txt>{notes.error.message}</Txt>
        </Alert>
      )}
      {notes.data?.length === 0 && (
        <p className="text-muted-foreground">
          <Txt>No feedback yet.</Txt>
        </p>
      )}
      {Boolean(notes.data?.length) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Txt>When</Txt>
              </TableHead>
              <TableHead>
                <Txt>Account</Txt>
              </TableHead>
              <TableHead>
                <Txt>Message</Txt>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.data?.map(note => (
              <TableRow key={note.id}>
                <TableCell className="whitespace-normal">
                  <DateText value={note.created_at} />
                </TableCell>
                <TableCell className="font-mono">#{note.user_id.slice(0, 8).toUpperCase()}</TableCell>
                <TableCell className="min-w-48 whitespace-normal break-words">{note.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Topic>
  )
}

/** Short answers for the people at the desk. Nothing here links away: each section is one tap from the menu. */
export function HelpPage() {
  const administrator = useMe().data?.role === 'administrator'
  const operator = useOperator().data
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5 md:p-8">
      <h1 className="display text-[30px] leading-tight">
        <Txt>Help</Txt>
      </h1>
      <Topic title="Handling a report">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <Txt>Open Reports. It shows open reports first; choose All statuses to see closed ones.</Txt>
          </li>
          <li>
            <Txt>Check the photo, the pin and the category. The AI's guess can be wrong, so you decide.</Txt>
          </li>
          <li>
            <Txt>Pick a ready note or write your own. The resident reads it, so say what you actually did.</Txt>
          </li>
          <li>
            <Txt>Press the status button, or the "and next" one to go straight to the next report.</Txt>
          </li>
        </ol>
        <p className="text-muted-foreground">
          <Txt>
            BarangAI never forwards a report to another office. If one must act, contact them yourself and write it
            under Document work.
          </Txt>
        </p>
      </Topic>
      <Topic title="Forgot your password?">
        {administrator ? (
          <>
            <p>
              <Txt>Staff: reset it under Staff accounts and give the temporary password in person.</Txt>
            </p>
            <p className="text-muted-foreground">
              <Txt>Your own: use the reset command on this computer. See docs/mobile.md.</Txt>
            </p>
          </>
        ) : (
          <p>
            <Txt>
              Ask your administrator. They give you a temporary password in person, and you choose your own when you
              sign in.
            </Txt>
          </p>
        )}
      </Topic>
      <Topic title="Who to contact">
        <p>
          {operator?.name || operator?.contact ? (
            [operator.name, operator.contact].filter(Boolean).join(' · ')
          ) : (
            <Txt>Ask your barangay's administrator.</Txt>
          )}
        </p>
      </Topic>
      <Topic title="Send feedback">
        <FeedbackForm />
      </Topic>
      {administrator && <FeedbackList />}
    </div>
  )
}
