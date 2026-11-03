import type { ComponentProps } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A real <select>: phones open their own picker wheel, which beats any custom popover on touch. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className={cn('relative inline-flex w-full', className)}>
      <select
        data-slot="native-select"
        className="h-11 w-full appearance-none rounded-xl border border-input bg-card pr-9 pl-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 lg:h-9 lg:rounded-lg lg:text-sm"
        {...props}
      >
        {children}
      </select>
      <ChevronsUpDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
}
