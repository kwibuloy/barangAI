import { useEffect, useRef, useState } from 'react'

/** Counts a number up from where it was (zero at first) over ~600ms, easing out; instant under reduced motion. */
export function useCountUp(value: number, duration = 600) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const origin = from.current
    let frame = requestAnimationFrame(function step() {
      // performance.now(), not the frame's own time stamp, which can come from another clock (jsdom, some browsers)
      // and once gave counts in the billions.
      const progress = Math.min(1, Math.max(0, (performance.now() - start) / duration))
      const eased = 1 - (1 - progress) ** 3
      const current = Math.round(origin + (value - origin) * eased)
      // A new value mid-count starts from what is on screen, not from where the last count began.
      from.current = current
      setShown(current)
      if (progress < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return shown
}
