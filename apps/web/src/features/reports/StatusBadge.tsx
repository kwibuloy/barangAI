import { BadgeCheck, CircleCheckBig, Clock3, Search, Wrench, XCircle } from 'lucide-react'
import { DateText } from '@/components/DateText'
import { cn } from '@/lib/utils'
import { Txt } from '../../lib/i18n'
import type { Status } from './types'

export const STATUS_STYLE = {
  Pending: { icon: Clock3, color: 'var(--status-pending)' },
  'Under Verification': { icon: Search, color: 'var(--status-verifying)' },
  Accepted: { icon: BadgeCheck, color: 'var(--status-accepted)' },
  'In Progress': { icon: Wrench, color: 'var(--status-progress)' },
  Resolved: { icon: CircleCheckBig, color: 'var(--status-resolved)' },
  Rejected: { icon: XCircle, color: 'var(--status-rejected)' },
} satisfies Record<Status, unknown>

/** Each status has its own colour and icon, so it never depends on colour alone. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { icon: Icon, color } = STATUS_STYLE[status] ?? STATUS_STYLE.Pending
  return (
    <span
      data-status={status}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 13%, transparent)` }}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold whitespace-nowrap',
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
      <Txt>{status}</Txt>
    </span>
  )
}

/** Row subtitle on phones: the badge under the title keeps the title itself untruncated. */
export function StatusLine({ status, date }: { status: Status; date?: string }) {
  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <StatusBadge status={status} />
      {date && (
        <span className="text-[13px]">
          <DateText value={date} compact />
        </span>
      )}
    </span>
  )
}
