import { useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

type Phase = 'idle' | 'surprise' | 'covering' | 'covered' | 'turning-away' | 'away' | 'turning-back' | 'returning'
/** Cancellable choreography; no password data, animation never gates navigation. */
export function useKapPrivacy(focused: boolean, revealed: boolean, ready: boolean) {
  const reduced = Boolean(useReducedMotion())
  const [phase, setPhase] = useState<Phase>('idle')
  const current = useRef<Phase>('idle')
  const target = revealed ? 'away' : focused ? 'covered' : 'idle'
  useLayoutEffect(() => {
    const timers: number[] = []
    const enter = (next: Phase) => {
      current.current = next
      setPhase(next)
    }
    const later = (next: Phase, delay: number) => timers.push(window.setTimeout(() => enter(next), delay))
    if (reduced || !ready) enter(target)
    else if (target === 'away') {
      enter('turning-away')
      later('away', 220)
    } else if (target === 'covered') {
      if (current.current === 'idle' || current.current === 'surprise') {
        enter('surprise')
        later('covering', 140)
        later('covered', 620)
      } else if (current.current === 'covering' || current.current === 'returning') {
        enter('covering')
        later('covered', 480)
      } else if (current.current === 'away' || current.current === 'turning-away') {
        enter('turning-back')
        later('covered', 220)
      } else enter('covered')
    } else if (current.current !== 'idle') {
      enter('returning')
      later('idle', 480)
    }
    return () => timers.forEach(window.clearTimeout)
  }, [target, reduced, ready])
  // Reveal must conceal immediately, before effects run. Never expose the neutral face between private poses.
  return {
    phase:
      revealed && !['turning-away', 'away'].includes(phase)
        ? reduced || !ready
          ? 'away'
          : 'turning-away'
        : focused && phase === 'idle'
          ? 'covered'
          : phase,
    reduced,
  }
}
