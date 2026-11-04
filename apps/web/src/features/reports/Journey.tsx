import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Txt } from '../../lib/i18n'
import { STATUS_STYLE } from './StatusBadge'
import type { Status } from './types'

const PATH: Status[] = ['Pending', 'Under Verification', 'Accepted', 'In Progress', 'Resolved']

/**
 * A report's way through the required path, drawn like a lesson path: chunky round steps joined by a thick road.
 * Passed steps are green with a check, the current one pulses with a "Now" bubble, later ones wait in grey.
 * A rejected report stops after Under Verification with a red step. Status names stay in text, never colour alone.
 */
export function Journey({ status, compact, className }: { status: Status; compact?: boolean; className?: string }) {
  const steps: Status[] = status === 'Rejected' ? ['Pending', 'Under Verification', 'Rejected'] : PATH
  const current = steps.indexOf(status)
  return (
    <ol className={cn('relative grid', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
      {steps.map((step, index) => {
        const done = index < current || (status === 'Resolved' && index === current)
        const now = index === current && status !== 'Resolved' && status !== 'Rejected'
        const rejected = step === 'Rejected'
        const Icon = done ? Check : STATUS_STYLE[step].icon
        return (
          <li
            key={step}
            className="relative flex flex-col items-center text-center"
            aria-current={now ? 'step' : undefined}
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute right-1/2 h-2 rounded-full',
                  compact
                    ? 'top-[18px] w-[calc(100%-40px)] -translate-x-[20px]'
                    : 'top-[26px] w-[calc(100%-56px)] -translate-x-[28px]',
                  index <= current ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            {now && (
              <span className="journey-now absolute -top-9 z-10 rounded-xl border-2 bg-card px-2.5 py-1 label-caps text-[11px] text-link">
                <Txt>Now</Txt>
              </span>
            )}
            <span
              className={cn(
                'relative z-[1] grid place-items-center rounded-full',
                compact ? 'size-11' : 'size-[60px]',
                rejected
                  ? 'bg-destructive text-white shadow-[0_5px_0_var(--destructive-edge)]'
                  : done || now
                    ? 'bg-primary text-primary-foreground shadow-[0_5px_0_var(--primary-edge)]'
                    : 'bg-border text-muted-foreground shadow-[0_5px_0_color-mix(in_oklab,var(--border)_80%,black)]',
                now && !rejected && 'journey-pulse',
              )}
            >
              <Icon className={compact ? 'size-5' : 'size-7'} strokeWidth={done ? 3.5 : 2.6} aria-hidden="true" />
            </span>
            <span
              className={cn(
                'mt-3 px-0.5 leading-tight font-extrabold',
                compact ? 'text-[11px]' : 'text-[13px]',
                done || now ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <Txt>{step}</Txt>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
