import { Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { hazardLabels, label } from './categories'
import type { Priority, PriorityReason } from './types'

const LEVEL_STYLE: Record<Priority['level'], string> = {
  high: 'var(--status-rejected)',
  medium: 'var(--status-progress)',
  low: 'var(--muted-foreground)',
}
export const LEVEL_LABEL: Record<Priority['level'], string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
}

/** Staff-only hint; the word, not just the colour, carries the level. */
export function PriorityChip({ priority, className }: { priority: Priority; className?: string }) {
  const color = LEVEL_STYLE[priority.level]
  return (
    <span
      // Outlined, unlike the filled status badges, so a priority is never read as a status.
      style={{ color, borderColor: `color-mix(in oklab, ${color} 45%, transparent)` }}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full whitespace-nowrap border border-dashed px-2 text-[12.5px] font-semibold',
        className,
      )}
    >
      <Gauge className="size-3.5" aria-hidden="true" />
      <Txt>{LEVEL_LABEL[priority.level]}</Txt>
    </span>
  )
}

function useReason() {
  const t = useText()
  return (reason: PriorityReason) => {
    switch (reason.code) {
      case 'category':
        return `${t('Category')}: ${t(label(reason.detail))}`
      case 'hazard':
        return t(hazardLabels[reason.detail] ?? reason.detail)
      case 'residents':
        return `${reason.detail} ${t('residents reported it')}`
      case 'recent':
        return reason.detail === 0 ? t('Reported today') : `${t('Last report')} ${reason.detail} ${t('days ago')}`
    }
  }
}

/** Why the suggestion is what it is, point by point, so staff can disagree with it. */
export function PriorityPanel({ priority }: { priority: Priority }) {
  const t = useText()
  const reason = useReason()
  return (
    <section aria-label={t('Suggested priority')} className="hairline space-y-3 rounded-2xl bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">
          <Txt>Suggested priority</Txt>
        </h3>
        <PriorityChip priority={priority} />
      </div>
      <ul className="space-y-1.5 text-[14px]">
        {priority.reasons.map(item => (
          <li key={`${item.code}-${item.detail}`} className="flex items-baseline justify-between gap-3">
            <span>{reason(item)}</span>
            <span className="shrink-0 font-mono text-muted-foreground">+{item.points}</span>
          </li>
        ))}
      </ul>
      <p className="border-t pt-2.5 text-[13px] text-muted-foreground">
        <Txt>A suggestion from severity, recency and independent residents. Staff decide the order.</Txt>
      </p>
    </section>
  )
}
