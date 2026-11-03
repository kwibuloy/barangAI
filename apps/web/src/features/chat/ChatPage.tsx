import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowUp } from 'lucide-react'
import { Kap } from '@/components/Kap'
import { LargeTitle } from '@/components/page'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { post } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { label } from '../reports/categories'
import { useReports } from '../reports/queries'

type ChatLanguage = 'en' | 'fil' | 'taglish'
type Message = { from: 'you' | 'assistant'; text: string }

const SUGGESTIONS = ['How do I report flooding?', 'What happens after I submit?', 'How do I track my report?']

export function ChatPage() {
  const t = useText()
  const reports = useReports()
  const { language: interfaceLanguage } = useLanguage()
  const [message, setMessage] = useState('')
  const [reportId, setReportId] = useState('')
  const [language, setLanguage] = useState<ChatLanguage>('en')
  useEffect(() => {
    setLanguage(interfaceLanguage)
  }, [interfaceLanguage])
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  // Newer browsers return a promise from smooth scrollIntoView; an effect must not return it.
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])
  async function ask(text: string) {
    setMessages(current => [...current, { from: 'you', text }])
    setMessage('')
    setBusy(true)
    try {
      const answer = await post<{ reply?: string; response?: string; message?: string }>('/chat', {
        message: text,
        language,
        ...(reportId ? { report_id: reportId } : {}),
      })
      const reply = answer.reply ?? answer.response ?? answer.message ?? t('I could not answer that request.')
      setMessages(current => [...current, { from: 'assistant', text: reply }])
    } catch {
      setMessages(current => [
        ...current,
        {
          from: 'assistant',
          text: t('Chat guidance is unavailable right now. You can still submit and track reports here.'),
        },
      ])
    } finally {
      setBusy(false)
    }
  }
  function send(event: FormEvent) {
    event.preventDefault()
    if (message.trim()) void ask(message.trim())
  }
  return (
    <div className="lg:mx-auto lg:max-w-3xl">
      <LargeTitle
        title={t('Ask BarangAI')}
        subtitle={<Txt>Get reporting guidance in English, Filipino, or Taglish.</Txt>}
        trailing={<ResidentAccount />}
      />
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
        <label className="sr-only" htmlFor="chat-report">
          <Txt>Report to track (optional)</Txt>
        </label>
        <NativeSelect id="chat-report" value={reportId} onChange={event => setReportId(event.target.value)}>
          <option value="">{t('General guidance')}</option>
          {(reports.data ?? []).map(report => (
            <option key={report.id} value={report.id}>
              {t(label(report.resident_category))} · {report.id.slice(0, 8)}
            </option>
          ))}
        </NativeSelect>
        <label className="sr-only" htmlFor="chat-language">
          <Txt>Language</Txt>
        </label>
        <NativeSelect
          id="chat-language"
          className="w-32"
          value={language}
          onChange={event => setLanguage(event.target.value as ChatLanguage)}
        >
          <option value="en">English</option>
          <option value="fil">Filipino</option>
          <option value="taglish">Taglish</option>
        </NativeSelect>
      </div>
      {/* Desktop: transcript and composer share one panel, sized to the window. */}
      <div className="lg:hairline lg:flex lg:max-h-[calc(100dvh-15rem)] lg:min-h-[24rem] lg:flex-col lg:rounded-3xl lg:bg-card lg:p-5">
        <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center pt-2 text-center">
              <Kap pose="welcome" motion="float" className="h-40 w-auto" />
              <p className="mt-2 text-[15px] text-muted-foreground">
                <Txt>Hi! I can help you report concerns and follow up on them.</Txt>
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(text => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => void ask(t(text))}
                    className="hairline min-h-11 rounded-full bg-card px-4 text-[15px] font-medium text-primary transition-transform active:scale-[0.97]"
                  >
                    <Txt>{text}</Txt>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((item, index) => (
                <m.div
                  key={index}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex', item.from === 'you' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[82%] rounded-[20px] px-3.5 py-2 text-[16px] whitespace-pre-wrap',
                      item.from === 'you'
                        ? 'rounded-br-md bg-primary text-primary-foreground'
                        : 'rounded-bl-md bg-card hairline',
                    )}
                  >
                    {item.text}
                  </div>
                </m.div>
              ))}
            </AnimatePresence>
          )}
          {busy && (
            <div className="flex justify-start" aria-label={t('Typing…')}>
              <div className="hairline flex gap-1 rounded-[20px] rounded-bl-md bg-card px-4 py-3">
                {[0, 1, 2].map(dot => (
                  <m.span
                    key={dot}
                    className="size-2 rounded-full bg-muted-foreground/60"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: dot * 0.18 }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
        <form
          onSubmit={send}
          className="glass hairline sticky bottom-[calc(var(--tab-offset)+12px)] z-20 mt-4 flex items-center gap-2 rounded-full p-1.5 pl-4 md:bottom-28 lg:static lg:mt-3 lg:bg-background lg:backdrop-blur-none"
        >
          <label className="sr-only" htmlFor="chat-message">
            <Txt>Message</Txt>
          </label>
          <input
            id="chat-message"
            value={message}
            onChange={event => setMessage(event.target.value)}
            placeholder={t('Type your question…')}
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label={t('Send')}
            disabled={busy || !message.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
          >
            <ArrowUp className="size-5" strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </div>
  )
}
