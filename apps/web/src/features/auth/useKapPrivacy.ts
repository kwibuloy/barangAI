import { useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

export type KapPhase = 'idle' | 'surprise' | 'peek' | 'covered'

/**
 * Kap's password manners. Typing a hidden password: a wide-eyed beat, then he covers his eyes and cheekily peeks
 * through his feathers. Showing the password: both eyes fully covered, at once. The peek is play-acting only:
 * no password data reaches Kap, and his tracking eyes never follow the password field. Animation never gates
 * the form.
 */
export function useKapPrivacy(focused: boolean, revealed: boolean, ready: boolean) {
  const reduced = Boolean(useReducedMotion())
  const [phase, setPhase] = useState<KapPhase>('idle')
  const current = useRef<KapPhase>('idle')
  const target: KapPhase = revealed ? 'covered' : focused ? 'peek' : 'idle'
  useLayoutEffect(() => {
    let timer = 0
    const enter = (next: KapPhase) => {
      current.current = next
      setPhase(next)
    }
    if (target === 'peek' && !reduced && ready && (current.current === 'idle' || current.current === 'surprise')) {
      enter('surprise')
      timer = window.setTimeout(() => enter('peek'), 160)
    } else enter(target)
    return () => clearTimeout(timer)
  }, [target, reduced, ready])
  // Revealing covers immediately, before effects run; focus never shows a plain idle frame first.
  const shown: KapPhase = revealed
    ? 'covered'
    : focused && phase === 'idle'
      ? reduced || !ready
        ? 'peek'
        : 'surprise'
      : phase
  return { phase: shown, reduced }
}
