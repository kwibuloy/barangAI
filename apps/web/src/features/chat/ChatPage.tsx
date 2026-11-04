import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowUp } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { Kap } from '@/components/Kap'
import { LargeTitle } from '@/components/page'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { post } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'
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
  const desktop = useMediaQuery(DESKTOP)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // The newest message stays in view: after each message, and when the keyboard opens and the screen shrinks.
  useEffect(() => {
    const node = scroller.current
    if (node && messages.length) node.scrollTo?.({ top: node.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const keep = () => {
      const node = scroller.current
      if (node && messages.length) node.scrollTop = node.scrollHeight
    }
    viewport.addEventListener('resize', keep)
    return () => viewport.removeEventListener('resize', keep)
  }, [messages.length])
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
    if (message.trim() && !busy) void ask(message.trim())
  }
  const welcome = messages.length === 0
  const composer = (
    <form
      onSubmit={send}
      className="flex items-end gap-2 rounded-2xl border-2 bg-card p-1.5 pl-4 focus-within:border-[#84d8ff] lg:mt-3 lg:bg-background dark:focus-within:border-[#3f8db5]"
    >
      <label className="sr-only" htmlFor="chat-message">
        <Txt>Message</Txt>
      </label>
      {/* Grows with the question (up to five lines) so the whole message stays readable while typing. */}
      <textarea
        id="chat-message"
        ref={input}
        rows={1}
        value={message}
        enterKeyHint="send"
        onChange={event => setMessage(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event)
        }}
        placeholder={t('Type your question…')}
        className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-snug outline-none [field-sizing:content] placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        aria-label={t('Send')}
        disabled={busy || !message.trim()}
        // Keeps the keyboard up after sending, like a messaging app.
        onPointerDown={event => event.preventDefault()}
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-edge)] transition-[translate,box-shadow,opacity] active:translate-y-[3px] active:shadow-none disabled:opacity-35 disabled:shadow-none"
      >
        <ArrowUp className="size-5" strokeWidth={2.6} />
      </button>
    </form>
  )
  const transcript = (
    <>
      {welcome ? (
        <div className="flex flex-col items-center pt-2 text-center">
          <p className="kap-bubble kap-bubble-down relative rounded-2xl border-2 bg-card px-4 py-3 text-[16px] leading-snug font-bold">
            <Txt>Hi! I can help you report concerns and follow up on them.</Txt>
          </p>
          <Kap pose="welcome" motion="greet" interactive className="chat-kap mt-2 h-[min(6rem,12svh)] sm:h-44" />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map(text => (
              <button
                key={text}
                type="button"
                onPointerDown={event => event.preventDefault()}
                onClick={() => void ask(t(text))}
                className="edge min-h-11 rounded-2xl bg-card px-4 text-[15px] font-extrabold text-link"
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
              className={cn('flex items-end gap-2', item.from === 'you' ? 'justify-end' : 'justify-start')}
            >
              {/* Kap answers in his own voice: his sticker head beside each reply. */}
              {item.from !== 'you' && <BrandMark size={34} className="mb-0.5 shrink-0" />}
              <div
                data-message
                className={cn(
                  'max-w-[80%] rounded-2xl border-2 px-3.5 py-2.5 text-[16px] font-semibold break-words whitespace-pre-wrap',
                  item.from === 'you'
                    ? 'rounded-br-md border-link bg-link text-white dark:text-[#131f24]'
                    : 'rounded-bl-md bg-card',
                )}
              >
                {item.text}
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      )}
      {busy && (
        <div className="flex items-end justify-start gap-2" aria-label={t('Typing…')}>
          <BrandMark size={34} className="mb-0.5 shrink-0" />
          <div className="flex gap-1 rounded-2xl rounded-bl-md border-2 bg-card px-4 py-3.5">
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
    </>
  )
  const options = (
    <div className="grid grid-cols-[1fr_auto] gap-2">
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
  )
  const disclaimer = (
    <Txt>
      Automated general guidance, which can be wrong. It is not official advice and it does not send anything to staff.
      If anyone is in danger, call 911.
    </Txt>
  )

  if (desktop)
    return (
      <div className="mx-auto max-w-3xl">
        <LargeTitle
          title={t('Ask BarangAI')}
          subtitle={<Txt>Get reporting guidance in English, Filipino, or Taglish.</Txt>}
          trailing={<ResidentAccount />}
        />
        <p className="mb-3 px-1 text-[13px] text-muted-foreground">{disclaimer}</p>
        <div className="mb-4">{options}</div>
        {/* Transcript and composer share one panel, sized to the window. */}
        <div className="hairline flex max-h-[calc(100dvh-15rem)] min-h-[24rem] flex-col rounded-3xl bg-card p-5">
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" aria-live="polite">
            {transcript}
          </div>
          {composer}
        </div>
      </div>
    )

  // Phones and tablets: a messaging-app screen pinned between the top and the tabs (or the keyboard), so the
  // transcript scrolls on its own and the composer never covers it.
  return (
    <div className="fixed inset-x-0 top-0 bottom-[var(--tab-offset)] z-10 flex flex-col bg-background md:bottom-24">
      <header className="pt-safe shrink-0 border-b-2 bg-background">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1 className="truncate text-[17px] font-extrabold">
            <Txt>Ask BarangAI</Txt>
          </h1>
          <ResidentAccount />
        </div>
      </header>
      <div
        ref={scroller}
        className="mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6"
        aria-live="polite"
      >
        {/* Settings step aside while the keyboard is up; the conversation needs the room. */}
        <div className="chat-extras space-y-2 pb-1">
          {options}
          <p className="px-1 text-[12.5px] leading-snug text-muted-foreground">{disclaimer}</p>
        </div>
        {transcript}
      </div>
      <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pt-1 pb-2 sm:px-6">{composer}</div>
    </div>
  )
}
