import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useKapPrivacy } from '../src/features/auth/useKapPrivacy'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('runs surprise then covering then covered and cancels stale movement on reveal', () => {
  vi.useFakeTimers()
  const { result, rerender, unmount } = renderHook(({ focus, reveal }) => useKapPrivacy(focus, reveal, true), {
    initialProps: { focus: false, reveal: false },
  })
  rerender({ focus: true, reveal: false })
  expect(result.current.phase).toBe('surprise')
  act(() => {
    vi.advanceTimersByTime(140)
  })
  expect(result.current.phase).toBe('covering')
  rerender({ focus: true, reveal: true })
  expect(result.current.phase).toBe('turning-away')
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(result.current.phase).toBe('away')
  rerender({ focus: true, reveal: false })
  expect(result.current.phase).toBe('turning-back')
  act(() => {
    vi.advanceTimersByTime(220)
  })
  expect(result.current.phase).toBe('covered')
  rerender({ focus: false, reveal: false })
  expect(result.current.phase).toBe('returning')
  rerender({ focus: true, reveal: false })
  expect(result.current.phase).toBe('covering')
  act(() => {
    vi.advanceTimersByTime(480)
  })
  expect(result.current.phase).toBe('covered')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('keeps privacy immediate when images are unavailable and cancels surprise after a rapid blur', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ focus, ready }) => useKapPrivacy(focus, false, ready), {
    initialProps: { focus: true, ready: false },
  })
  expect(result.current.phase).toBe('covered')
  rerender({ focus: false, ready: true })
  act(() => {
    vi.advanceTimersByTime(500)
  })
  rerender({ focus: true, ready: true })
  expect(result.current.phase).toBe('surprise')
  rerender({ focus: false, ready: true })
  expect(result.current.phase).toBe('returning')
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(result.current.phase).toBe('idle')
})
