import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Slot } from 'radix-ui'

// Duolingo-style "sticker" buttons: a flat face over a solid bottom edge (the box shadow). Pressing sinks the face
// into the edge, so the button feels physical without any gradient or glow.
const PRESS =
  'shadow-[0_var(--lip)_0_var(--lip-color)] active:not-aria-[haspopup]:translate-y-[var(--lip)] active:not-aria-[haspopup]:shadow-none'

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-2xl border-2 border-transparent bg-clip-padding text-[15px] font-extrabold max-w-full text-center leading-tight tracking-[0.04em] uppercase transition-[translate,box-shadow,background-color,filter] duration-100 outline-none select-none [--lip:4px] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px] [&_svg]:stroke-[2.5]",
  {
    variants: {
      variant: {
        default: cn('bg-primary text-primary-foreground [--lip-color:var(--primary-edge)] hover:brightness-105', PRESS),
        sky: cn('bg-sky text-white [--lip-color:var(--sky-edge)] hover:brightness-105 dark:text-[#131f24]', PRESS),
        tinted: cn(
          'border-[#84d8ff] bg-sky-soft text-link [--lip-color:#84d8ff] hover:brightness-[1.02] dark:border-[#1f6f96] dark:[--lip-color:#1f6f96]',
          PRESS,
        ),
        outline: cn('border-border bg-card text-link [--lip-color:var(--border)] hover:bg-muted', PRESS),
        secondary: cn(
          'border-border bg-card text-secondary-foreground [--lip-color:var(--border)] hover:bg-muted',
          PRESS,
        ),
        ghost:
          'tracking-[0.04em] text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive: cn(
          'bg-destructive text-white [--lip-color:var(--destructive-edge)] hover:brightness-105 dark:text-[#131f24]',
          PRESS,
        ),
        link: 'tracking-normal normal-case text-link underline-offset-4 hover:underline',
      },
      size: {
        // 48px tall including the lip: comfortably over the 44px touch minimum. Heights are minimums so a long
        // translation wraps onto a second line instead of spilling out of the button.
        default: 'min-h-12 gap-2 py-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
        xs: "min-h-8 gap-1 py-1 rounded-xl px-2.5 text-[12px] [--lip:2px] [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'min-h-10 gap-1.5 py-1 rounded-xl px-3.5 text-[13px] [--lip:3px]',
        lg: 'min-h-14 gap-2.5 py-2 px-7 text-[17px]',
        icon: 'size-12 rounded-2xl',
        'icon-xs': "size-8 rounded-xl [--lip:2px] [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-10 rounded-xl [--lip:3px]',
        'icon-lg': 'size-14 rounded-2xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
