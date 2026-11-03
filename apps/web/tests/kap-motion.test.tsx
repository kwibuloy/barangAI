import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useKapBlink, useKapFlight } from '../src/features/auth/useKapMotion'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('waits 200ms for patrol, prevents privacy/reduced-motion conflicts, and cancels landing', () => {
  vi.useFakeTimers()
  const { result, rerender, unmount } = renderHook(
    ({ pending, privateActive, reduced }) => useKapFlight(pending, true, privateActive, reduced, true),
    { initialProps: { pending: false, privateActive: false, reduced: false } },
  )
  rerender({ pending: true, privateActive: false, reduced: false })
  act(() => {
    vi.advanceTimersByTime(199)
  })
  expect(result.current.flying).toBe(false)
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current.flying).toBe(true)
  rerender({ pending: true, privateActive: true, reduced: false })
  expect(result.current).toEqual({ flying: false, presenting: true, landing: false })
  rerender({ pending: true, privateActive: false, reduced: true })
  expect(result.current.flying).toBe(false)
  expect(result.current.presenting).toBe(true)
  rerender({ pending: true, privateActive: false, reduced: false })
  expect(result.current.flying).toBe(true)
  rerender({ pending: false, privateActive: false, reduced: false })
  expect(result.current.landing).toBe(true)
  act(() => {
    vi.advanceTimersByTime(420)
  })
  expect(result.current.landing).toBe(false)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('does not start patrol for a short operation or while backgrounded', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(
    ({ pending, visible }) => useKapFlight(pending, true, false, false, visible),
    { initialProps: { pending: true, visible: true } },
  )
  act(() => {
    vi.advanceTimersByTime(100)
  })
  rerender({ pending: false, visible: true })
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(result.current.flying).toBe(false)
  rerender({ pending: true, visible: false })
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(result.current.flying).toBe(false)
  rerender({ pending: true, visible: true })
  expect(result.current.flying).toBe(true)
})
it('blinks briefly and cancels both timers immediately when privacy or reduced motion disables blinking', () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const { result, rerender, unmount } = renderHook(({ active }) => useKapBlink(active), {
    initialProps: { active: true },
  })
  act(() => {
    vi.advanceTimersByTime(3800)
  })
  expect(result.current).toBe(true)
  act(() => {
    vi.advanceTimersByTime(135)
  })
  expect(result.current).toBe(false)
  act(() => {
    vi.advanceTimersByTime(3800)
  })
  expect(result.current).toBe(true)
  rerender({ active: false })
  expect(result.current).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  unmount()
})
