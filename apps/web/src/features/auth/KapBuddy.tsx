import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Kap's bust frames, cut by scripts/kap.py --cells from the user's three bust sheets: every frame is the same full
    grid cell, so swapping one for another moves only his eyes, face or wings, never the whole owl. Sign-in only
    (owner's decision, 4 Nov 2026): every other screen uses the full-body sticker poses (components/Kap.tsx). */
const FRAMES = import.meta.glob<string>('../../assets/kap/{face,look,cover}-*.webp', { eager: true, import: 'default' })
const frame = (name: string) => FRAMES[`../../assets/kap/${name}.webp`]

export type KapMood = 'smile' | 'happy' | 'bright' | 'calm' | 'keen' | 'sly' | 'smug'
export type KapGaze = 'left' | 'upleft' | 'up' | 'upright' | 'right' | 'downright' | 'down' | 'downleft'
/** The eye-covering sequence: 0 wings down … 3 peeking through, 4 one eye peeking, 7 fully covered and smiling. */
export type KapCover = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

const GAZES: KapGaze[] = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright']

/** The look frame for a point on screen, or null when the point is close enough that he looks straight at it. */
export function gazeToward(box: DOMRect, x: number, y: number): KapGaze | null {
  const dx = x - (box.left + box.width / 2)
  const dy = y - (box.top + box.height * 0.42)
  if (Math.hypot(dx, dy) < box.width * 0.45) return null
  const turn = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  return GAZES[(turn + 8) % 8]
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return reduced
}

/** Steps the cover frame one at a time toward `target`, so his wings rise and lower smoothly instead of jumping.
    Fully covering (a shown password) is the exception: it lands at once, so no open-eyed frame plays on the way. */
function useCoverFrame(target: KapCover, reduced: boolean) {
  const [shown, setShown] = useState<number>(target)
  useEffect(() => {
    if (reduced || shown === target || (target === 7 && shown < 7)) {
      if (shown !== target) setShown(target)
      return
    }
    const timer = window.setTimeout(() => setShown(value => value + Math.sign(target - value)), 55)
    return () => clearTimeout(timer)
  }, [target, shown, reduced])
  // Covering shows on the very render that asks for it, before the effect catches up.
  return (target === 7 ? 7 : shown) as KapCover
}

/**
 * Kap's head and shoulders, alive: he blinks every few seconds and, when `lively`, glances around now and then.
 * `gaze` points his eyes (the parent tracks a cursor or caret); `cover` raises his wings over his eyes.
 * Frames swap with a 90ms cross-fade; motion is off under prefers-reduced-motion except the blink-free still.
 */
export function KapBuddy({
  mood = 'smile',
  gaze = null,
  cover = 0,
  lively = false,
  preloadCover = false,
  className,
}: {
  mood?: KapMood
  gaze?: KapGaze | null
  cover?: KapCover
  lively?: boolean
  /** Mount the whole cover sequence up front, so the first wing raise never waits for an image to decode. */
  preloadCover?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  const [blink, setBlink] = useState(false)
  const [glance, setGlance] = useState<KapGaze | null>(null)
  const coverFrame = useCoverFrame(cover, reduced)
  const used = useRef(new Set<string>())

  useEffect(() => {
    if (reduced || coverFrame > 0) return
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setBlink(true)
          timer = window.setTimeout(() => {
            setBlink(false)
            schedule()
          }, 140)
        },
        2600 + Math.random() * 2600,
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [reduced, coverFrame])

  useEffect(() => {
    if (!lively || reduced || gaze || coverFrame > 0) {
      setGlance(null)
      return
    }
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setGlance(GAZES[Math.floor(Math.random() * GAZES.length)])
          timer = window.setTimeout(() => {
            setGlance(null)
            schedule()
          }, 900)
        },
        4200 + Math.random() * 3800,
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [lively, reduced, gaze, coverFrame])

  const current =
    coverFrame > 0
      ? `cover-${coverFrame}`
      : gaze
        ? `look-${gaze}`
        : glance
          ? `look-${glance}`
          : blink
            ? 'face-blink'
            : `face-${mood}`
  // Keep every frame shown so far mounted (and decoded), so going back to one never flashes empty.
  used.current.add(current)
  used.current.add(`face-${mood}`)
  if (preloadCover) for (let step = 1; step <= 7; step++) used.current.add(`cover-${step}`)
  if (!frame(current)) return null
  return (
    <span className={cn('kap-buddy relative inline-block aspect-square select-none', className)} aria-hidden="true">
      {[...used.current].map(name => (
        <img
          key={name}
          src={frame(name)}
          alt=""
          draggable={false}
          data-frame={name}
          data-shown={name === current}
          className="absolute inset-0 size-full object-contain"
        />
      ))}
    </span>
  )
}
