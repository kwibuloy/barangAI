import { cn } from '@/lib/utils'
import { useOperator } from '../features/legal/operator'
import { Txt } from '../lib/i18n'

export const useDemoMode = () => useOperator().data?.demo_mode === true

/** Says on screen that a server holds synthetic data (DEMO_MODE). Shows nothing on a real one. */
export function DemoChip({ className, long = false }: { className?: string; long?: boolean }) {
  if (!useDemoMode()) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border-2 border-[var(--status-pending)]/40 bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] px-2 py-0.5 text-[11px] leading-tight font-extrabold whitespace-nowrap text-[var(--status-pending)] print:border-black print:bg-transparent print:text-[12px] print:text-black',
        className,
      )}
    >
      <Txt>{long ? 'Demo data: synthetic, not real records' : 'Demo data'}</Txt>
    </span>
  )
}
