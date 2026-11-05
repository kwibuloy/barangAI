import { useState, type ReactNode } from 'react'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Txt } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import { FeedbackForm } from '../account/FeedbackForm'
import { useDeleteFeedback, useFeedbackNotes, useOperator } from './queries'

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

/** A note is free text and can name a resident, so an administrator can remove it, after one more press. */
function DeleteNote({ id }: { id: string }) {
  const [asking, setAsking] = useState(false)
  const remove = useDeleteFeedback()
  if (!asking)
    return (
      <Button size="xs" variant="secondary" onClick={() => setAsking(true)}>
        <Txt>Delete</Txt>
      </Button>
    )
  return (
    <div className="space-y-1.5">
      <p className="text-[13px]">
        <Txt>Delete this note for good?</Txt>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(id)}>
          <Txt>Yes, delete</Txt>
        </Button>
        <Button size="xs" variant="secondary" disabled={remove.isPending} onClick={() => setAsking(false)}>
          <Txt>Keep</Txt>
        </Button>
      </div>
      {remove.error && (
        <Alert>
          <Txt>{remove.error.message}</Txt>
        </Alert>
      )}
    </div>
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
              <TableHead>
                <span className="sr-only">
                  <Txt>Delete</Txt>
                </span>
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
                <TableCell className="whitespace-normal">
                  <DeleteNote id={note.id} />
                </TableCell>
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
        <FeedbackForm note="Your administrator reads this with your account number. Leave out residents' names and details." />
      </Topic>
      {administrator && <FeedbackList />}
    </div>
  )
}
