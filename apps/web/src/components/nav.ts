import { cn } from '@/lib/utils'

/** Duolingo-style navigation item: an uppercase label beside a colourful icon; the current page gets a sky-blue
    sticker outline. Shared by the resident and staff sidebars so both feel like one product. */
export function navItemClass(isActive: boolean) {
  return cn(
    'group/nav flex h-12 items-center gap-4 rounded-xl border-2 px-3 label-caps text-[14px] transition-colors',
    isActive
      ? 'border-[#84d8ff] bg-sky-soft text-link dark:border-[#3f8db5]'
      : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
  )
}

/** The icon colour and soft fill for a nav item. */
export const navIconStyle = (color: string) => ({
  color,
  fill: `color-mix(in oklab, ${color} 22%, transparent)`,
})
