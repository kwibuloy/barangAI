import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { emailEndPoint } from './emailEndPoint'

/** Pointer movement changes only CSS variables, never React/form/password state. `onAim` hears each target point
    (null when tracking stops) so Kap can choose the gaze frame that looks toward it. */
export function useKapTracking(
  root: RefObject<HTMLDivElement | null>,
  active: boolean,
  onAim?: (point: { x: number; y: number } | null) => void,
) {
  const aimed = useRef(onAim)
  useLayoutEffect(() => {
    aimed.current = onAim
  })
  useEffect(() => {
    const node = root.current
    if (!node) return
    let frame = 0
    let emailFrame = 0
    const mirror = document.createElement('span')
    mirror.setAttribute('aria-hidden', 'true')
    mirror.style.cssText =
      'position:fixed;left:-10000px;top:0;white-space:pre;visibility:hidden;pointer-events:none;contain:layout style;'

    let targetX = 0,
      targetY = 0,
      eyeX = 0,
      eyeY = 0,
      headX = 0,
      headY = 0
    const reset = () => {
      for (const name of ['eye-x', 'eye-y', 'head-x', 'head-y']) node.style.setProperty(`--kap-${name}`, '0px')
      node.style.setProperty('--kap-head-tilt', '0deg')
      node.dataset.tracking = 'off'
      aimed.current?.(null)
    }
    reset()
    if (!active) return
    document.body.append(mirror)
    const update = () => {
      frame = 0
      eyeX += (targetX * 24 - eyeX) * 0.38
      eyeY += (targetY * 24 - eyeY) * 0.38
      headX += (targetX * 15 - headX) * 0.11
      headY += (targetY * 16 - headY) * 0.11
      node.style.setProperty('--kap-eye-x', `${eyeX.toFixed(2)}px`)
      node.style.setProperty('--kap-eye-y', `${eyeY.toFixed(2)}px`)
      node.style.setProperty('--kap-head-x', `${headX.toFixed(2)}px`)
      node.style.setProperty('--kap-head-y', `${headY.toFixed(2)}px`)
      node.style.setProperty('--kap-head-tilt', `${(headX / 8).toFixed(2)}deg`)
      if (
        Math.abs(targetX * 24 - eyeX) +
          Math.abs(targetY * 24 - eyeY) +
          Math.abs(targetX * 15 - headX) +
          Math.abs(targetY * 16 - headY) >
        0.05
      )
        frame = requestAnimationFrame(update)
    }
    const aim = (x: number, y: number, source: string) => {
      const box = node.getBoundingClientRect()
      targetX = Math.max(-1, Math.min(1, (x - box.left - box.width / 2) / (box.width * 1.5)))
      targetY = Math.max(-1, Math.min(1, (y - box.top - box.height / 2) / (box.height * 1.5)))
      node.dataset.tracking = source
      aimed.current?.({ x, y })
      if (!frame) frame = requestAnimationFrame(update)
    }
    const email = () => {
      if (emailFrame) return
      emailFrame = requestAnimationFrame(() => {
        emailFrame = 0
        const field = document.activeElement
        if (field instanceof HTMLInputElement && field.matches('.auth-form input[type=email]')) {
          const point = emailEndPoint(field, mirror)
          if (point) aim(point.x, point.y, 'email-end')
        }
      })
    }
    const pointer = (event: PointerEvent) => {
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches('.auth-form input[type=email]')
      )
        return
      if (event.pointerType !== 'touch' && matchMedia('(pointer:fine)').matches)
        aim(event.clientX, event.clientY, 'cursor')
    }
    const focus = (event: FocusEvent) => {
      const field = event.target
      if (
        field instanceof HTMLElement &&
        field.matches('.auth-form input, .auth-form button') &&
        !field.closest('[data-password-area]')
      ) {
        if (field instanceof HTMLInputElement && field.type === 'email') {
          email()
          return
        }
        const box = field.getBoundingClientRect()
        aim(box.left + box.width / 2, box.top + box.height / 2, 'field')
      }
    }
    const leave = () => {
      if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'email') {
        email()
        return
      }
      targetX = 0
      targetY = 0
      node.dataset.tracking = 'off'
      aimed.current?.(null)
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('pointermove', pointer, { passive: true })
    document.addEventListener('focusin', focus)
    for (const event of ['input', 'change', 'keyup', 'click', 'compositionend', 'selectionchange'])
      document.addEventListener(event, email)
    document.addEventListener('scroll', email, true)
    window.addEventListener('resize', email)
    document.documentElement.addEventListener('pointerleave', leave)
    if (document.activeElement instanceof HTMLElement)
      focus({ target: document.activeElement } as unknown as FocusEvent)
    return () => {
      window.removeEventListener('pointermove', pointer)
      document.removeEventListener('focusin', focus)
      for (const event of ['input', 'change', 'keyup', 'click', 'compositionend', 'selectionchange'])
        document.removeEventListener(event, email)
      document.removeEventListener('scroll', email, true)
      window.removeEventListener('resize', email)
      if (emailFrame) cancelAnimationFrame(emailFrame)
      mirror.remove()
      document.documentElement.removeEventListener('pointerleave', leave)
      if (frame) cancelAnimationFrame(frame)
      reset()
    }
  }, [root, active])
}

export function useKapBlink(active: boolean) {
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    let wait: number, close: number
    setBlink(false)
    if (!active) return
    const schedule = () => {
      wait = window.setTimeout(
        () => {
          setBlink(true)
          close = window.setTimeout(() => {
            setBlink(false)
            schedule()
          }, 135)
        },
        3800 + Math.random() * 2600,
      )
    }
    schedule()
    return () => {
      clearTimeout(wait)
      clearTimeout(close)
    }
  }, [active])
  return blink
}

/** Patrol never blocks the real authentication lifecycle. */
export function useKapFlight(
  pending: boolean,
  allowed: boolean,
  privateActive: boolean,
  reduced: boolean,
  visible: boolean,
) {
  const [longRequest, setLongRequest] = useState(false)
  const [landing, setLanding] = useState(false)
  const wasPresenting = useRef(false)
  useEffect(() => {
    setLongRequest(false)
    if (!pending) return
    const timer = window.setTimeout(() => setLongRequest(true), 200)
    return () => clearTimeout(timer)
  }, [pending])
  const presenting = pending && longRequest && allowed && visible
  const flying = presenting && !privateActive && !reduced
  const departing = wasPresenting.current && !presenting && !reduced && visible
  useLayoutEffect(() => {
    let timer: number | undefined
    if (presenting || reduced || !visible) {
      setLanding(false)
    } else if (wasPresenting.current && !presenting) {
      setLanding(true)
      timer = window.setTimeout(() => setLanding(false), 420)
    }
    wasPresenting.current = presenting
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [presenting, reduced, visible])
  return { flying, presenting, landing: !presenting && (landing || departing) && !reduced && visible }
}
