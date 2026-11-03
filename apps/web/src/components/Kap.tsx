import { cn } from '@/lib/utils'

/** Poses cut from the user's own Kap artwork by scripts/kap.py; a missing pose renders nothing. */
const POSES = import.meta.glob<string>('../assets/kap/*.webp', { eager: true, import: 'default' })

export type KapPose = 'thumbs' | 'wave' | 'welcome' | 'idea' | 'clipboard' | 'arms' | 'thinking' | 'cheer'

export function kapAvailable(pose: KapPose) {
  return Boolean(POSES[`../assets/kap/${pose}.webp`])
}

export function Kap({
  pose,
  motion = 'none',
  className,
  decorative = true,
}: {
  pose: KapPose
  motion?: 'greet' | 'float' | 'none'
  className?: string
  decorative?: boolean
}) {
  const src = POSES[`../assets/kap/${pose}.webp`]
  if (!src) return null
  return (
    <img
      src={src}
      alt={decorative ? '' : 'Kap, the BarangAI mascot'}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn(
        'pointer-events-none select-none',
        motion === 'greet' && 'kap-greet',
        motion === 'float' && 'kap-float',
        className,
      )}
    />
  )
}
