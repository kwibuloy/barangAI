import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useKapPrivacy } from '../src/features/auth/useKapPrivacy'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('takes a surprised beat, then peeks; showing the password covers at once and hiding it peeks again', () => {
  vi.useFakeTimers()
  const { result, rerender, unmount } = renderHook(({ focus, reveal }) => useKapPrivacy(focus, reveal, true), {
    initialProps: { focus: false, reveal: false },
  })
  rerender({ focus: true, reveal: false })
  expect(result.current.phase).toBe('surprise')
  act(() => {
    vi.advanceTimersByTime(160)
  })
  expect(result.current.phase).toBe('peek')
  rerender({ focus: true, reveal: true })
  expect(result.current.phase).toBe('covered')
  rerender({ focus: true, reveal: false })
  expect(result.current.phase).toBe('peek')
  rerender({ focus: false, reveal: false })
  expect(result.current.phase).toBe('idle')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('never shows an idle frame on focus and skips the beat when images are missing or a blur comes fast', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ focus, ready }) => useKapPrivacy(focus, false, ready), {
    initialProps: { focus: true, ready: false },
  })
  expect(result.current.phase).toBe('peek')
  rerender({ focus: false, ready: true })
  expect(result.current.phase).toBe('idle')
  rerender({ focus: true, ready: true })
  expect(result.current.phase).toBe('surprise')
  rerender({ focus: false, ready: true })
  expect(result.current.phase).toBe('idle')
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(result.current.phase).toBe('idle')
})
it('covers immediately on reveal, even before its effect runs', () => {
  const { result } = renderHook(() => useKapPrivacy(false, true, true))
  expect(result.current.phase).toBe('covered')
})
