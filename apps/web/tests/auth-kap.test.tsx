import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthKap } from '../src/features/auth/AuthKap'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const props = { privacyFocus: false, revealed: false, pending: false, failed: false }

it('never exposes the neutral pose while a privacy image is unavailable', () => {
  const { container } = render(<AuthKap {...props} privacyFocus />)
  const neutral = container.querySelector('.auth-kap-art') as HTMLElement
  const covered = container.querySelector('[data-pose=covered]') as HTMLImageElement
  expect(neutral.style.visibility).toBe('hidden')
  expect(covered.style.visibility).toBe('hidden')
  fireEvent.load(covered)
  expect(covered.style.visibility).toBe('visible')
  fireEvent.error(covered)
  expect(covered.style.visibility).toBe('hidden')
  expect(neutral.style.visibility).toBe('hidden')
})

it('keeps privacy above pending and failure and never fades between the two private poses', () => {
  const { container, rerender } = render(<AuthKap {...props} privacyFocus pending failed />)
  const covered = container.querySelector('[data-pose=covered]') as HTMLImageElement
  const away = container.querySelector('[data-pose=away]') as HTMLImageElement
  fireEvent.load(covered)
  fireEvent.load(away)
  expect(container.firstChild).toHaveAttribute('data-state', 'covered')
  rerender(<AuthKap {...props} privacyFocus revealed pending failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'away')
  expect(covered.style.visibility).toBe('hidden')
  expect(away.style.visibility).toBe('visible')
  rerender(<AuthKap {...props} revealed />)
  expect(away.style.visibility).toBe('visible')
  rerender(<AuthKap {...props} pending />)
  expect(container.firstChild).toHaveAttribute('data-state', 'pending')
  expect(away.style.visibility).toBe('hidden')
  expect((container.querySelector('.auth-kap-art') as HTMLElement).style.visibility).toBe('visible')
})

it('recovers after a brief error response without ending an active privacy interaction', () => {
  vi.useFakeTimers()
  const { container, rerender, unmount } = render(<AuthKap {...props} failed />)
  expect(container.firstChild).toHaveAttribute('data-state', 'error')
  rerender(<AuthKap {...props} failed privacyFocus />)
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(container.firstChild).toHaveAttribute('data-state', 'covered')
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
  expect(container.firstChild).toHaveAttribute('data-state', 'away')
  visibility.mockReturnValue('visible')
  fireEvent(document, new Event('visibilitychange'))
  expect(container.firstChild).toHaveAttribute('data-page-visible', 'true')
  unmount()
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
})
