import { useEffect } from 'react'

/** Marks the page while a phone's keyboard is up: nothing else says so, and focus outlasts the keyboard. */
export function useKeyboardMark() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport || !window.matchMedia?.('(max-width: 1023px) and (pointer: coarse)').matches) return
    let tallest = viewport.height
    let width = viewport.width
    const onResize = () => {
      // Turning the phone changes the height for another reason.
      if (viewport.width !== width) {
        width = viewport.width
        tallest = viewport.height
      }
      tallest = Math.max(tallest, viewport.height)
      document.documentElement.classList.toggle('keyboard-open', viewport.height < tallest * 0.8)
    }
    viewport.addEventListener('resize', onResize)
    return () => {
      viewport.removeEventListener('resize', onResize)
      document.documentElement.classList.remove('keyboard-open')
    }
  }, [])
}
