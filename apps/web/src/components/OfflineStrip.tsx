import { useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { useText } from '../lib/i18n'
import { useOfflineSince } from '../lib/live'

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * A thin line across the top once checks keep failing, in both shells. The screen below keeps what it last loaded.
 * `data-offline` makes room for it through --offline-h (styles.css), so nothing slides underneath.
 */
export function OfflineStrip() {
  const t = useText()
  const since = useOfflineSince()
  const shown = since !== null
  useEffect(() => {
    document.documentElement.toggleAttribute('data-offline', shown)
    return () => document.documentElement.removeAttribute('data-offline')
  }, [shown])
  return (
    <div aria-live="polite">
      {shown && (
        <p className="pt-safe fixed inset-x-0 top-0 z-50 border-b-2 bg-bee-soft text-center text-[13px] leading-[26px] font-extrabold">
          <WifiOff className="mr-1.5 inline size-3.5 align-[-2px]" strokeWidth={2.6} aria-hidden="true" />
          {since ? t('Offline · last updated {time}').replace('{time}', clock.format(since)) : t('Offline')}
        </p>
      )}
    </div>
  )
}
