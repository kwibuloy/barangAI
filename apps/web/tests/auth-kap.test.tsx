import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthKap } from '../src/features/auth/AuthKap'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const props = { privacyFocus: false, revealed: false, pending: false, failed: false }
const loadAll = (container: HTMLElement) =>
  container.querySelectorAll('img[data-asset]').forEach(image => fireEvent.load(image))

it('shows no Kap at all until both poses have loaded, so privacy never falls back to his open eyes', () => {
  const { container } = render(<AuthKap {...props} privacyFocus />)
  expect(container.querySelector('.auth-kap-rig')).toBeNull()
  fireEvent.load(container.querySelector('img[data-asset=neutral]')!)
  expect(container.querySelector('.auth-kap-rig')).toBeNull()
  fireEvent.load(container.querySelector('img[data-asset=covered]')!)
  expect(container.querySelector('.auth-kap-rig')).not.toBeNull()
  fireEvent.error(container.querySelector('img[data-asset=covered]')!)
  expect(container.querySelector('.auth-kap-rig')).toBeNull()
})

it('peeks while a hidden password has focus, covers fully when shown, and keeps privacy above pending and failure', () => {
  const { container, rerender } = render(<AuthKap {...props} privacyFocus pending failed />)
  loadAll(container)
  rerender(<AuthKap {...props} privacyFocus pending failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'peek')
  // No looking frames while private: only the cover sequence.
  expect(container.querySelector('[data-shown=true]')?.getAttribute('data-frame')).toMatch(/^(cover|face)-/)
  expect(container.querySelector('[data-shown=true][data-frame^=look]')).toBeNull()
  rerender(<AuthKap {...props} privacyFocus revealed pending failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'covered')
  // Showing the password covers both eyes on the same render: no open-eyed frame plays on the way.
  expect(container.querySelector('[data-shown=true]')).toHaveAttribute('data-frame', 'cover-7')
  // The privacy snapshot holds for the whole request, even after the field loses focus.
  rerender(<AuthKap {...props} pending />)
  expect(container.firstChild).toHaveAttribute('data-state', 'peek')
})

it('recovers after a brief error response without ending an active privacy interaction', () => {
  vi.useFakeTimers()
  const { container, rerender, unmount } = render(<AuthKap {...props} failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'error')
  rerender(<AuthKap {...props} failed privacyFocus />)
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(container.firstChild).toHaveAttribute('data-state', 'peek')
  rerender(<AuthKap {...props} failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'idle')
  rerender(<AuthKap {...props} />)
  rerender(<AuthKap {...props} failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'error')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('pauses when the page is hidden and removes its visibility listener on unmount', () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const remove = vi.spyOn(document, 'removeEventListener')
  const { container, unmount } = render(<AuthKap {...props} revealed />)
  expect(container.firstChild).toHaveAttribute('data-page-visible', 'true')
  visibility.mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(container.firstChild).toHaveAttribute('data-page-visible', 'false')
  expect(container.firstChild).toHaveAttribute('data-state', 'covered')
  visibility.mockReturnValue('visible')
  fireEvent(document, new Event('visibilitychange'))
  expect(container.firstChild).toHaveAttribute('data-page-visible', 'true')
  unmount()
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
})

it('raises his wings frame by frame to one peeking eye, then to fully covered eyes when the password is shown', () => {
  vi.useFakeTimers()
  const shown = (container: HTMLElement) => container.querySelector('[data-shown=true]')?.getAttribute('data-frame')
  // Each frame step is its own timer and render, so time moves in small slices.
  const play = () => {
    for (let slice = 0; slice < 30; slice++)
      act(() => {
        vi.advanceTimersByTime(60)
      })
  }
  const { container, rerender } = render(<AuthKap {...props} />)
  loadAll(container)
  rerender(<AuthKap {...props} />)
  expect(shown(container)).toMatch(/^face-/)
  rerender(<AuthKap {...props} privacyFocus />)
  play()
  expect(shown(container)).toBe('cover-4')
  rerender(<AuthKap {...props} privacyFocus revealed />)
  play()
  expect(shown(container)).toBe('cover-7')
  // While private he never shows a looking frame, whatever the pointer does.
  fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
  expect(shown(container)).toBe('cover-7')
})

it('covers both eyes on the same render when the password is shown straight from idle', () => {
  const { container, rerender } = render(<AuthKap {...props} />)
  loadAll(container)
  rerender(<AuthKap {...props} />)
  rerender(<AuthKap {...props} revealed />)
  expect(container.querySelector('[data-shown=true]')).toHaveAttribute('data-frame', 'cover-7')
})
