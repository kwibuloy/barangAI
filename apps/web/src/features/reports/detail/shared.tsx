// Layout pieces the report view shares.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Txt } from '../../../lib/i18n'

export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('hairline rounded-2xl bg-card p-5', className)}>
      {title && (
        <h3 className="mb-3 text-[15px] font-semibold">
          <Txt>{title}</Txt>
        </h3>
      )}
      {children}
    </section>
  )
}

export const fieldLabel = 'block space-y-1.5 text-[13px] font-medium text-muted-foreground'
