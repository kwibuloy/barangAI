import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGlassesFlow, type FlowDeps } from '../src/features/glasses/flow'
import {
  connectionFor,
  endGlassesSession,
  glassesAvailable,
  handOffPhoto,
  takeHandedOffPhoto,
} from '../src/features/glasses/connection'
import { ApiError } from '../src/lib/api'
import type { GlassesScreen } from '../src/features/glasses/connection'
import type { Prediction, Report } from '../src/features/reports/types'

const photo = new File(['x'], 'glasses.jpg', { type: 'image/jpeg' })
const pothole: Prediction = {
  prediction_available: true,
  model_category: 'potholes',
  confidence: 0.9,
  needs_check: false,
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(overrides: Partial<FlowDeps> = {}) {
  const screens: GlassesScreen[] = []
  const deps: FlowDeps = {
    t: text => text,
    show: screen => screens.push(screen),
    takePhoto: vi.fn(async () => photo),
    position: vi.fn(async () => [14.3294, 120.9367] as [number, number]),
    predict: vi.fn(async () => pothole),
    place: vi.fn(async () => ({ active: true, barangay: 'San Jose' })),
    street: vi.fn(async () => 'Aguinaldo Highway'),
    nearby: vi.fn(async () => ({ own: [], cases: [] })),
    submit: vi.fn(async () => ({ id: 'r1' }) as Report),
    finishOnPhone: vi.fn(),
    ...overrides,
  }
  const flow = createGlassesFlow(deps)
  flow.ready()
  return { flow, deps, screens, last: () => screens[screens.length - 1] }
}

afterEach(() => {
  delete (window as { Capacitor?: unknown }).Capacitor
})

describe('glasses report flow', () => {
  it('sends only after the resident confirms on the glasses', async () => {
    const { flow, deps, last } = setup()
    flow.press('click')
    await settle()
    expect(last().title).toBe('Potholes')
    expect(last().body).toContain('Aguinaldo Highway, San Jose')
    expect(last().body).toContain('AI can be wrong')
    expect(deps.submit).not.toHaveBeenCalled()

    flow.press('click')
    await settle()
    const form = vi.mocked(deps.submit).mock.calls[0][0]
    expect(form.get('resident_category')).toBe('potholes')
    expect(form.get('latitude')).toBe('14.3294')
    expect(form.get('location_source')).toBe('device')
    // The AI's description can't be checked on the glasses, so it never goes from there.
    expect(form.has('description')).toBe(false)
    expect(last().title).toBe('Sent! Thank you')
  })

  it('cancels with a long press and starts over', async () => {
    const { flow, deps, last } = setup()
    flow.press('click')
    await settle()
    flow.press('long_press')
    expect(last().title).toBe('Kap is ready')
    flow.press('click')
    await settle()
    expect(deps.takePhoto).toHaveBeenCalledTimes(2)
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('marks an unsure AI guess and a pin outside every barangay', async () => {
    const { flow, last } = setup({
      predict: async () => ({ ...pothole, model_category: 'broken_streetlights', needs_check: true }),
      place: async () => ({ active: false, barangay: null }),
    })
    flow.press('click')
    await settle()
    expect(last().tone).toBe('warning')
    expect(last().title).toBe('Broken streetlights · AI unsure · please check')
    expect(last().body).toContain('An administrator will review it')
  })

  it.each([
    ['no category', { predict: async () => ({ ...pothole, model_category: null }) }, "Kap couldn't tell what this is."],
    ['no GPS', { position: async () => null }, "Couldn't find your location."],
    [
      'a report nearby',
      { nearby: async () => ({ own: [{ id: 'mine' }], cases: [] }) as never },
      'This may already be reported nearby.',
    ],
  ])('moves to the phone with the photo when there is %s', async (_, overrides, reason) => {
    const { flow, deps, last } = setup(overrides as Partial<FlowDeps>)
    flow.press('click')
    await settle()
    expect(last()).toMatchObject({ title: 'Finish on your phone', body: reason })
    expect(deps.finishOnPhone).toHaveBeenCalledWith(photo)
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('drops a cancelled check instead of showing it later', async () => {
    let answer: (prediction: Prediction) => void = () => {}
    const { flow, deps, last } = setup({ predict: () => new Promise(resolve => (answer = resolve)) })
    flow.press('click')
    await settle()
    flow.press('long_press')
    expect(last().title).toBe('Kap is ready')
    answer(pothole)
    await settle()
    expect(last().title).toBe('Kap is ready')
    flow.press('click')
    expect(deps.submit).not.toHaveBeenCalled()
  })

  it('hands a refused report to the phone but not one whose answer was lost', async () => {
    const refused = setup({ submit: async () => Promise.reject(new ApiError('Daily report limit reached', 429)) })
    refused.flow.press('click')
    await settle()
    refused.flow.press('click')
    await settle()
    expect(refused.deps.finishOnPhone).toHaveBeenCalledWith(photo)

    const lost = setup({ submit: async () => Promise.reject(new TypeError('Failed to fetch')) })
    lost.flow.press('click')
    await settle()
    lost.flow.press('click')
    await settle()
    expect(lost.deps.finishOnPhone).not.toHaveBeenCalled()
    expect(lost.last().body).toContain('Check My reports')
  })

  it('ignores presses while busy', async () => {
    let finish: (file: File) => void = () => {}
    const { flow, deps } = setup({ takePhoto: vi.fn(() => new Promise<File>(resolve => (finish = resolve))) })
    flow.press('click')
    flow.press('click')
    expect(deps.takePhoto).toHaveBeenCalledTimes(1)
    finish(photo)
    await settle()
  })
})

describe('glasses connection', () => {
  it('exists only in the Android app with the plugin', () => {
    expect(glassesAvailable()).toBe(false)
    ;(window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true }
    expect(glassesAvailable()).toBe(true)
  })

  it('reports a failed connect but not a resident closing the session', () => {
    expect(connectionFor('idle', 'LINK_TIMEOUT')).toMatchObject({ phase: 'off', problem: expect.any(String) })
    expect(connectionFor('idle', 'USER_CLOSED')).toMatchObject({ phase: 'off' })
    expect(connectionFor('started')).toEqual({ phase: 'on', problem: null })
  })

  it('forgets the glasses and any waiting photo on sign-out', async () => {
    const disconnect = vi.fn(async () => {})
    ;(window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      Plugins: {},
    }
    // Like a real Capacitor plugin object, it has a `then` that never settles.
    vi.doMock('@capacitor/core', () => ({ registerPlugin: () => ({ disconnect, then: () => {} }) }))
    localStorage.setItem('barangai-glasses', 'on')
    handOffPhoto(photo)
    endGlassesSession()
    await settle()
    expect(localStorage.getItem('barangai-glasses')).toBeNull()
    expect(takeHandedOffPhoto()).toBeNull()
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledWith({ forget: true }))
  })

  it('hands a photo to the report form once', () => {
    handOffPhoto(photo)
    expect(takeHandedOffPhoto()).toBe(photo)
    expect(takeHandedOffPhoto()).toBeNull()
  })
})
