import {
  CircleHelp,
  Construction,
  LampFloor,
  Signpost,
  Trash2,
  TreeDeciduous,
  Waves,
  Zap,
  type LucideProps,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category } from './types'

const STYLE: Record<Category, { icon: (props: LucideProps) => React.ReactNode; color: string }> = {
  flooding: { icon: Waves, color: '#1899d6' },
  fallen_trees: { icon: TreeDeciduous, color: '#46a302' },
  broken_streetlights: { icon: LampFloor, color: '#e5a000' },
  exposed_wiring: { icon: Zap, color: '#ff7a00' },
  potholes: { icon: Construction, color: '#a5703f' },
  uncollected_garbage: { icon: Trash2, color: '#00a59a' },
  damaged_signage: { icon: Signpost, color: '#a560e8' },
  other: { icon: CircleHelp, color: '#8a8a8a' },
}

/** The category's own colour, for charts and bars that should match its tile. */
export const categoryColor = (category: Category) => (STYLE[category] ?? STYLE.other).color

export function CategoryIcon({ category, ...props }: { category: Category } & LucideProps) {
  const Icon = (STYLE[category] ?? STYLE.other).icon
  return <Icon aria-hidden="true" {...props} />
}

/** Sticker tile: white glyph on the category's own colour, over a darker bottom edge. */
export function CategoryTile({ category, size = 'md' }: { category: Category; size?: 'sm' | 'md' | 'lg' }) {
  const { icon: Icon, color } = STYLE[category] ?? STYLE.other
  return (
    <span
      aria-hidden="true"
      style={{
        backgroundColor: color,
        boxShadow: `0 ${size === 'sm' ? 2 : 3}px 0 color-mix(in oklab, ${color} 70%, black)`,
      }}
      className={cn(
        'mb-[3px] inline-flex shrink-0 items-center justify-center text-white',
        size === 'sm' && 'size-7 rounded-lg',
        size === 'md' && 'size-10 rounded-xl',
        size === 'lg' && 'size-12 rounded-2xl',
      )}
    >
      <Icon className={size === 'lg' ? 'size-6' : size === 'md' ? 'size-5' : 'size-4'} strokeWidth={2.5} />
    </span>
  )
}
