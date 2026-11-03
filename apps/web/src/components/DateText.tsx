import { useLanguage } from '../lib/i18n'

const FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

/** Philippine day-month order ("26 Oct 2026, 9:13 PM"), in the interface language. Compact drops this year's year. */
export function DateText({
  value,
  compact = false,
  dateOnly = false,
}: {
  value: string
  compact?: boolean
  dateOnly?: boolean
}) {
  const { language } = useLanguage()
  const date = new Date(value)
  // A bare day ("2026-10-30") is a Philippine calendar day: show it there, without a time.
  const base: Intl.DateTimeFormatOptions = dateOnly
    ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }
    : FORMAT
  const options = compact && date.getFullYear() === new Date().getFullYear() ? { ...base, year: undefined } : base
  return (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat(language === 'fil' ? 'fil-PH' : 'en-GB', options).format(date)}
    </time>
  )
}
