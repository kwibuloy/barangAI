import { useCallback, type PointerEvent } from 'react'

/**
 * 2.5D tilt for a `.tilt` card (styles.css): the card leans toward the pointer and children with `data-depth`
 * drift by their depth, so flat layers read as a little diorama. Mouse and pen only; touch screens and
 * reduced-motion users get a still card.
 */
export function useTilt({ angle = 3, shift = 10 }: { angle?: number; shift?: number } = {}) {
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const box = event.currentTarget.getBoundingClientRect()
      const x = ((event.clientX - box.left) / box.width) * 2 - 1
      const y = ((event.clientY - box.top) / box.height) * 2 - 1
      const style = event.currentTarget.style
      style.setProperty('--ry', `${(x * angle).toFixed(2)}deg`)
      style.setProperty('--rx', `${(-y * angle).toFixed(2)}deg`)
      style.setProperty('--px', (x * shift).toFixed(1))
      style.setProperty('--py', (y * shift * 0.6).toFixed(1))
    },
    [angle, shift],
  )
  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    for (const name of ['--rx', '--ry', '--px', '--py']) event.currentTarget.style.removeProperty(name)
  }, [])
  return { onPointerMove, onPointerLeave }
}
