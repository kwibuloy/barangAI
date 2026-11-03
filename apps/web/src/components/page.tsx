import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router'
import { m } from 'motion/react'
import { ChevronRight, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Kap, type KapPose } from './Kap'

/** Big friendly page title: once it scrolls away a compact one appears in a solid top bar with a 2px rule. */
export function LargeTitle({
  title,
  subtitle,
  trailing,
  bar = false,
}: {
  title: string
  subtitle?: ReactNode
  trailing?: ReactNode
  /** Task screens (the report steps): phones keep just the slim bar, so each step fits on one screen. */
  bar?: boolean
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
          compact || bar ? 'border-b-2 bg-background' : 'border-b-2 border-transparent bg-background',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <span
            aria-hidden="true"
            className={cn(
              'truncate text-[17px] font-extrabold transition-opacity duration-200',
              compact || bar ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-1">{trailing}</div>
        </div>
      </div>
      <header className={cn('pt-1 pb-4 lg:pt-8 lg:pb-6', bar && 'max-lg:sr-only')}>
        <h1 className="display text-[30px] leading-[1.1] lg:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] font-bold text-muted-foreground">{subtitle}</p>}
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
          {title && <h2 className="text-[20px] leading-tight font-extrabold">{title}</h2>}
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
      <span className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-4 pr-4 [:not([data-cards])>.row+.row_&]:border-t">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[16px] leading-snug font-extrabold">{title}</span>
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

/** Duolingo-style chunky toggle built on radio inputs, so it works with the keyboard and screen readers: the chosen
    option is a blue sticker tile with a bottom lip. */
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
    <fieldset className={cn('flex gap-1 rounded-2xl border-2 bg-background p-1', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map(option => (
        <label
          key={option.value}
          className="relative flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl px-2 label-caps text-[13px] text-muted-foreground transition-colors has-checked:text-[#0b6aa8] dark:has-checked:text-link has-focus-visible:ring-2 has-focus-visible:ring-ring"
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
              className="absolute inset-0 rounded-xl border-2 border-b-4 border-[#84d8ff] bg-sky-soft dark:border-[#3f8db5]"
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
      {pose && <Kap pose={pose} motion="pop" interactive className="mb-3 h-36 w-auto" />}
      {!pose && icon && <span className="mb-3 text-muted-foreground">{icon}</span>}
      <strong className="text-[19px] font-extrabold">{title}</strong>
      {body && <p className="mt-1 max-w-xs text-[15px] font-bold text-muted-foreground">{body}</p>}
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
