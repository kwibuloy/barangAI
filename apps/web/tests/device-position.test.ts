import { afterEach, describe, expect, it, vi } from 'vitest'
import { devicePosition } from '../src/features/reports/location'

const getCurrentPosition = vi.hoisted(() => vi.fn())
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { getCurrentPosition } }))

const here = { coords: { latitude: 14.33, longitude: 120.94 } }
const options = { enableHighAccuracy: true, timeout: 10000 }

afterEach(() => {
  vi.unstubAllGlobals()
  getCurrentPosition.mockReset()
  delete (window as { Capacitor?: unknown }).Capacitor
})

describe('devicePosition', () => {
  it('uses the browser outside the Android app', () => {
    const browser = vi.fn((success: (position: typeof here) => void) => success(here))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: browser } })
    const onPosition = vi.fn()
    devicePosition(onPosition, vi.fn(), options)
    expect(onPosition).toHaveBeenCalledWith(here)
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('uses the native plugin in the Android app', async () => {
    ;(window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true }
    getCurrentPosition.mockResolvedValue(here)
    const position = await new Promise(resolve => devicePosition(resolve, vi.fn(), options))
    expect(position).toEqual(here)
    expect(getCurrentPosition).toHaveBeenCalledWith(options)
  })

  it('reports a refused native request as a failure', async () => {
    ;(window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true }
    getCurrentPosition.mockRejectedValue(new Error('denied'))
    const onPosition = vi.fn()
    await new Promise<void>(resolve => devicePosition(onPosition, resolve, options))
    expect(onPosition).not.toHaveBeenCalled()
  })
})
