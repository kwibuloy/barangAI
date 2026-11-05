import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { post } from '../../lib/api'
import { Txt, useText } from '../../lib/i18n'

const MAX_FEEDBACK = 1000

export function useSendFeedback() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => post('/feedback', { message }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  })
}

/** A note to the administrators, from the staff Help page and a resident's account sheet. */
export function FeedbackForm({ note }: { note: string }) {
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
        <Txt>{note}</Txt> {message.length}/{MAX_FEEDBACK}
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
