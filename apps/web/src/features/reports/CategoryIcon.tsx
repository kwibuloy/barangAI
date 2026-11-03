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
  flooding: { icon: Waves, color: '#1d7fd8' },
  fallen_trees: { icon: TreeDeciduous, color: '#2f8a3b' },
  broken_streetlights: { icon: LampFloor, color: '#c98a0b' },
  exposed_wiring: { icon: Zap, color: '#d9480f' },
  potholes: { icon: Construction, color: '#8a6a4a' },
  uncollected_garbage: { icon: Trash2, color: '#0f8a7e' },
  damaged_signage: { icon: Signpost, color: '#5b4fd6' },
  other: { icon: CircleHelp, color: '#7a7670' },
}

export function CategoryIcon({ category, ...props }: { category: Category } & LucideProps) {
  const Icon = (STYLE[category] ?? STYLE.other).icon
  return <Icon aria-hidden="true" {...props} />
}

/** Settings-app style tile: white glyph on the category's own colour. */
export function CategoryTile({ category, size = 'md' }: { category: Category; size?: 'sm' | 'md' | 'lg' }) {
  const { icon: Icon, color } = STYLE[category] ?? STYLE.other
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white',
        size === 'sm' && 'size-7 rounded-[7px]',
        size === 'md' && 'size-9 rounded-[9px]',
        size === 'lg' && 'size-12 rounded-xl',
      )}
    >
      <Icon className={size === 'lg' ? 'size-6' : size === 'md' ? 'size-5' : 'size-4'} strokeWidth={2.2} />
    </span>
  )
}
