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
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      setShown(Math.round(origin + (value - origin) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
      else from.current = value
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return shown
}
