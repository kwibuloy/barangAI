import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useCountUp } from '../src/hooks/use-count-up'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Frames run by hand, on a clock the test moves. Each frame is stamped with a time from some other clock. */
function frames() {
  let clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => queue.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return (advance: number) =>
    act(() => {
      clock += advance
      queue.splice(0).forEach(callback => callback(-1e12))
    })
}

it('counts to the value whatever clock the frames are stamped with, never outside the count', () => {
  const run = frames()
  const { result, rerender } = renderHook(({ value }) => useCountUp(value), { initialProps: { value: 6 } })
  run(0)
  expect(result.current).toBe(0)
  run(1000)
  expect(result.current).toBe(6)
  rerender({ value: 2400 })
  run(100)
  expect(result.current).toBeGreaterThan(6)
  expect(result.current).toBeLessThan(2400)
  run(1000)
  expect(result.current).toBe(2400)
})

it('starts a changed value from what is on screen, not from where the last count began', () => {
  const run = frames()
  const { result, rerender } = renderHook(({ value }) => useCountUp(value, 1000), { initialProps: { value: 100 } })
  run(300) // part of the way to 100
  const midway = result.current
  expect(midway).toBeGreaterThan(0)
  expect(midway).toBeLessThan(100)
  rerender({ value: 200 })
  run(0) // the new count's first frame
  expect(result.current).toBe(midway)
  run(2000)
  expect(result.current).toBe(200)
})
