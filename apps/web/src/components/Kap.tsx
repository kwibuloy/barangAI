import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useText } from '../lib/i18n'

/** Full-body sticker poses cut from the user's own Kap sheet by scripts/kap.py: the mascot on every screen but sign-in,
    which has its own bust frames (features/auth/KapBuddy.tsx). A missing pose renders nothing. */
const POSES = import.meta.glob<string>(['../assets/kap/*.webp', '!../assets/kap/{face,look,cover}-*.webp'], {
  eager: true,
  import: 'default',
})

export type KapPose = 'thumbs' | 'wave' | 'welcome' | 'idea' | 'clipboard' | 'arms' | 'thinking' | 'cheer'

export function kapAvailable(pose: KapPose) {
  return Boolean(POSES[`../assets/kap/${pose}.webp`])
}

/**
 * Kap, animated with CSS only (styles.css, "Kap rig"): the outer span takes entrances and hops, the image keeps a
 * slow breathing squash anchored at his feet, so the two never fight over one transform.
 * - greet: pops in, then waves (a wiggle) twice; float: breathes and bobs; pop: springs in once; none: still.
 * - interactive: hops on hover and on click (a squash on landing), like a sticker you can poke.
 */
export function Kap({
  pose,
  motion = 'none',
  interactive = false,
  className,
  decorative = true,
}: {
  pose: KapPose
  motion?: 'greet' | 'float' | 'pop' | 'none'
  interactive?: boolean
  className?: string
  decorative?: boolean
}) {
  const t = useText()
  const [hops, setHops] = useState(0)
  const src = POSES[`../assets/kap/${pose}.webp`]
  if (!src) return null
  return (
    <span
      // Re-keying restarts the hop animation on every click.
      key={hops}
      onClick={interactive ? () => setHops(count => count + 1) : undefined}
      className={cn(
        'kap inline-block select-none',
        motion === 'greet' && 'kap-greet',
        motion === 'pop' && 'kap-pop',
        motion === 'float' && 'kap-bob',
        interactive ? 'kap-interactive' : 'pointer-events-none',
        hops > 0 && 'kap-hop',
        className,
      )}
    >
      <img
        src={src}
        alt={decorative ? '' : t('Kap, the BarangAI mascot')}
        aria-hidden={decorative || undefined}
        draggable={false}
        className={cn('block h-full w-auto', motion !== 'none' && 'kap-breathe')}
      />
    </span>
  )
}

/** Kap with a speech bubble, Duolingo style: a white sticker bubble with a 2px border and a tail pointing at him. */
export function KapSays({
  pose,
  children,
  side = 'right',
  motion = 'greet',
  kapClassName,
  className,
}: {
  pose: KapPose
  children: ReactNode
  side?: 'right' | 'top'
  motion?: 'greet' | 'float' | 'pop' | 'none'
  kapClassName?: string
  className?: string
}) {
  return (
    <div className={cn('flex', side === 'top' ? 'flex-col-reverse items-center' : 'items-end gap-3', className)}>
      <Kap pose={pose} motion={motion} interactive className={cn('h-28 shrink-0', kapClassName)} />
      <div
        className={cn(
          'kap-bubble relative rounded-2xl border-2 bg-card px-4 py-3 text-[15px] leading-snug font-bold',
          side === 'top' ? 'kap-bubble-down mb-3' : 'kap-bubble-left mb-8',
        )}
      >
        {children}
      </div>
    </div>
  )
}
