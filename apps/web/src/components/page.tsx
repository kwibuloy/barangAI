import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router'
import { m } from 'motion/react'
import { ChevronRight, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Kap, type KapPose } from './Kap'

/** iOS large title: a compact title fades into the frosted top bar once the big one scrolls away. */
export function LargeTitle({
  title,
  subtitle,
  trailing,
}: {
  title: string
  subtitle?: ReactNode
  trailing?: ReactNode
}) {
  const marker = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const node = marker.current
    if (!node || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { threshold: 0 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <>
      <div
        className={cn(
          'pt-safe sticky top-0 z-30 -mx-4 transition-[background-color,box-shadow] duration-200 sm:-mx-6 lg:hidden',
          compact ? 'glass shadow-[0_0.5px_0_var(--border)]' : 'bg-transparent',
        )}
      >
        <div className="flex h-11 items-center justify-between gap-3 px-4 sm:px-6">
          <span
            aria-hidden="true"
            className={cn(
              'truncate text-[17px] font-semibold transition-opacity duration-200',
              compact ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-1">{trailing}</div>
        </div>
      </div>
      <header className="pt-1 pb-4 lg:pt-8 lg:pb-6">
        <h1 className="text-[34px] leading-[1.12] font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>}
        <div ref={marker} className="h-px" />
      </header>
    </>
  )
}

/** Inset grouped list (Settings-app style). */
export function Group({
  title,
  action,
  footer,
  className,
  children,
}: {
  title?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('mb-8', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          {title && <h2 className="text-[20px] leading-tight font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      <div className="hairline overflow-hidden rounded-2xl bg-card">{children}</div>
      {footer && <p className="mt-2 px-4 text-[13px] text-muted-foreground">{footer}</p>}
    </section>
  )
}

type RowProps = {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  chevron?: boolean
  className?: string
}

function RowBody({ leading, title, subtitle, trailing, chevron }: RowProps) {
  return (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-4 pr-4 [.row+.row_&]:border-t">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">{title}</span>
          {subtitle && <span className="mt-1 block text-[14px] text-muted-foreground">{subtitle}</span>}
        </span>
        {trailing}
        {chevron && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />}
      </span>
    </>
  )
}

const rowClass = 'row flex min-h-16 w-full items-center gap-3.5 pl-4 text-left'

export function Row(props: RowProps) {
  return (
    <div className={cn(rowClass, props.className)}>
      <RowBody {...props} />
    </div>
  )
}

export function LinkRow({ to, label, ...props }: RowProps & { to: string; label?: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(rowClass, 'transition-colors active:bg-accent hover:bg-accent/60', props.className)}
    >
      <RowBody chevron {...props} />
    </Link>
  )
}

/** iOS segmented control built on radio inputs, so it works with the keyboard and screen readers. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  id,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  id: string
}) {
  return (
    <fieldset className={cn('flex rounded-[10px] bg-muted p-0.5', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map(option => (
        <label
          key={option.value}
          className="relative flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-[14px] font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <input
            className="sr-only"
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {value === option.value && (
            <m.span
              layoutId={`segment-${id}`}
              className="absolute inset-0 rounded-lg bg-card shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-secondary"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative">{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

export function EmptyState({
  pose,
  icon,
  title,
  body,
  action,
}: {
  pose?: KapPose
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {pose && <Kap pose={pose} motion="float" className="mb-3 h-36 w-auto" />}
      {!pose && icon && <span className="mb-3 text-muted-foreground">{icon}</span>}
      <strong className="text-[17px] font-semibold">{title}</strong>
      {body && <p className="mt-1 max-w-xs text-[15px] text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Alert({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn('rounded-xl bg-destructive/10 px-4 py-3 text-[15px] font-medium text-destructive', className)}
      {...props}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="grid min-h-[40dvh] place-items-center text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
    </div>
  )
}
