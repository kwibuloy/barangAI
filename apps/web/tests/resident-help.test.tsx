import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'
import { OfflineStrip } from '../src/components/OfflineStrip'
import { Kap } from '../src/components/Kap'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../src/components/ui/sheet'
import { locationProblem } from '../src/features/reports/location'
import {
  api,
  CANT_REACH,
  CANT_REACH_REPORT,
  NetworkError,
  post,
  READ_TIMEOUT_MS,
  reportErrorMessage,
  UPLOAD_TIMEOUT_MS,
} from '../src/lib/api'
import { filipino, LanguageProvider, LanguageSwitch } from '../src/lib/i18n'
import { noteReachable, noteUnreachable, OFFLINE_AFTER_MS, resetConnection } from '../src/lib/live'
import {
  clearAllDrafts,
  clearDraft,
  DRAFT_MAX_AGE_MS,
  keepOnlyDraftsOf,
  loadDraft,
  saveDraft,
} from '../src/features/reports/draft'
import type { ReportDraft } from '../src/features/reports/draft'

const leaflet = vi.hoisted(() => ({ pins: 0, tileEvents: {} as Record<string, () => void>, map: null as any }))
vi.mock('leaflet', () => {
  const map = {
    setView: () => map,
    fitBounds: vi.fn(),
    on: vi.fn(),
    stop: vi.fn(),
    remove: vi.fn(),
    getZoom: () => 12,
  }
  leaflet.map = map
  return {
    map: () => map,
    tileLayer: () => ({
      addTo: vi.fn(),
      on: (name: string, handler: () => void) => {
        leaflet.tileEvents[name] = handler
      },
    }),
    circleMarker: () => {
      leaflet.pins += 1
      const marker = {
        addTo: () => marker,
        setLatLng: vi.fn(),
        getLatLng: () => ({ lat: 0, lng: 0 }),
        bindTooltip: vi.fn(),
        on: vi.fn(),
      }
      return marker
    },
    geoJSON: () => {
      const layer = { addTo: () => layer, bringToBack: vi.fn(), remove: vi.fn() }
      return layer
    },
  }
})

/** Just enough IndexedDB for the drafts module: jsdom has none, and no new dependency is wanted for this. */
function fakeIndexedDB(failing = false) {
  const rows = new Map<IDBValidKey, unknown>()
  const answer = <T,>(value: () => T, transaction?: { oncomplete?: () => void }) => {
    const request: { result?: T; onsuccess?: () => void } = {}
    queueMicrotask(() => {
      request.result = value()
      request.onsuccess?.()
      queueMicrotask(() => transaction?.oncomplete?.())
    })
    return request
  }
  const database = {
    close: () => {},
    createObjectStore: () => {},
    transaction: () => {
      const transaction: { objectStore?: unknown; oncomplete?: () => void } = {}
      transaction.objectStore = () => ({
        put: (value: unknown, key: IDBValidKey) => answer(() => void rows.set(key, value), transaction),
        get: (key: IDBValidKey) => answer(() => rows.get(key), transaction),
        delete: (key: IDBValidKey) => answer(() => void rows.delete(key), transaction),
        clear: () => answer(() => rows.clear(), transaction),
        getAllKeys: () => answer(() => [...rows.keys()], transaction),
      })
      return transaction
    },
  }
  vi.stubGlobal('indexedDB', {
    open: () => {
      if (failing) throw new Error('storage is off')
      const request: { result?: unknown; onsuccess?: () => void } = {}
      queueMicrotask(() => {
        request.result = database
        request.onsuccess?.()
      })
      return request
    },
  })
  return rows
}

const RESIDENT = { id: 'r1', email: 'resident@example.test', role: 'resident' }
const at = (path: string, state: unknown = null) => window.history.replaceState({ usr: state, key: 'x' }, '', path)
const draft = (extra: Partial<ReportDraft> = {}): ReportDraft => ({
  photo: null,
  category: 'flooding',
  description: 'Knee-deep water.',
  latitude: '14.3294',
  longitude: '120.9367',
  locationSource: 'manual',
  details: null,
  photoGps: null,
  dismissedHazards: [],
  aiCategory: null,
  aiDescription: null,
  carriedCategory: null,
  caseId: null,
  step: 2,
  savedAt: Date.now(),
  ...extra,
})

type Call = { url: string; method: string; body?: any }
function serve(me: unknown, routes: (url: string, call: Call) => unknown = () => []) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const call = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      }
      calls.push(call)
      if (url.endsWith('/auth/me')) return me instanceof Response ? me : Response.json(me)
      const answer = routes(url, call)
      if (answer instanceof Error) throw answer
      return answer instanceof Response ? answer : Response.json(answer ?? [])
    }),
  )
  return calls
}

beforeEach(async () => {
  resetConnection()
  leaflet.pins = 0
  leaflet.tileEvents = {}
  // A fresh sign-in reopens drafts after any earlier test's sign-out.
  await keepOnlyDraftsOf('nobody')
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.lang = 'en'
})

describe('network errors', () => {
  it('turns a failed fetch into one friendly message, and adds that a report is safe on report screens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const caught = (await api('/reports').catch(error => error)) as Error
    expect(caught).toBeInstanceOf(NetworkError)
    expect(caught.message).toBe(CANT_REACH)
    expect(CANT_REACH).not.toMatch(/report/i)
    expect(reportErrorMessage(caught)).toBe(CANT_REACH_REPORT)
    expect(reportErrorMessage(new Error('Daily report limit reached'))).toBe('Daily report limit reached')
    expect(filipino[CANT_REACH]).toBeTruthy()
    expect(filipino[CANT_REACH_REPORT]).toBeTruthy()
  })

  it('treats a page that is not the API, such as a Wi-Fi sign-in page, as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Sign in to Wi-Fi</html>')))
    await expect(api('/reports')).rejects.toBeInstanceOf(NetworkError)
  })

  it("leaves a caller's own cancel alone, so a replaced photo isn't reported as a network problem", async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_done, fail) =>
            init.signal!.addEventListener('abort', () => fail(new DOMException('Aborted', 'AbortError'))),
          ),
      ),
    )
    const pending = api('/reports', { signal: controller.signal }).catch(error => error)
    controller.abort()
    expect(((await pending) as Error).name).toBe('AbortError')
  })

  it('gives up on a silent server, waiting far longer for an upload', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_done, fail) =>
            init.signal!.addEventListener('abort', () => fail(new DOMException('Aborted', 'AbortError'))),
          ),
      ),
    )
    const read = api('/reports').catch(error => error)
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1)
    expect(await read).toBeInstanceOf(NetworkError)
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000)
    let settled = false
    const upload = post('/reports', new FormData())
      .catch(error => error)
      .finally(() => {
        settled = true
      })
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1000)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await upload).toBeInstanceOf(NetworkError)
  })

  it('still reads the API error when there is one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ detail: 'Report not found' }, { status: 404 })))
    await expect(api('/reports/x')).rejects.toMatchObject({ status: 404, message: 'Report not found' })
  })
})

describe('offline strip', () => {
  it('appears after about three failed checks, not on one burst, and leaves on the next answer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T01:30:00Z'))
    render(<OfflineStrip />)
    noteReachable()
    const burst = () => act(() => [1, 2, 3].forEach(() => noteUnreachable()))
    burst()
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument()
    vi.setSystemTime(Date.now() + OFFLINE_AFTER_MS)
    act(() => noteUnreachable())
    const strip = screen.getByText(/Offline · last updated/)
    expect(strip).toHaveTextContent(/\d\d:\d\d/)
    expect(document.documentElement).toHaveAttribute('data-offline')
    act(() => noteReachable())
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveAttribute('data-offline')
  })

  it('shows in both shells', async () => {
    for (const me of [RESIDENT, { id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'North' }]) {
      resetConnection()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-05T01:30:00Z'))
      serve(me)
      render(<App />)
      await screen.findAllByRole('navigation')
      // The server goes quiet, so no later answer clears the strip.
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      await act(async () => {
        ;[1, 2, 3].forEach(() => noteUnreachable())
        vi.setSystemTime(Date.now() + OFFLINE_AFTER_MS)
        noteUnreachable()
      })
      expect(await screen.findByText(/^Offline/)).toBeInTheDocument()
      cleanup()
      vi.useRealTimers()
    }
  })
})

describe('when the session check gets no answer', () => {
  it('shows a retry, not the sign-in page, on a network failure, and recovers', async () => {
    let up = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (!up) throw new TypeError('Failed to fetch')
        return String(input).endsWith('/auth/me') ? Response.json(RESIDENT) : Response.json([])
      }),
    )
    render(<App />)
    expect(await screen.findByRole('heading', { name: "Can't reach your barangay's server" })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    up = true
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findAllByRole('navigation')
  })

  it('does the same on a server error', async () => {
    serve(Response.json({ detail: 'boom' }, { status: 500 }))
    vi.mocked(fetch).mockImplementation(async () => Response.json({ detail: 'boom' }, { status: 500 }))
    render(<App />)
    expect(await screen.findByRole('heading', { name: "Your barangay's server has a problem" })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('still signs out on a 401', async () => {
    serve(Response.json({ detail: 'Authentication required' }, { status: 401 }), () => ({ enabled: false }))
    render(<App />)
    expect(await screen.findByLabelText('Password')).toBeInTheDocument()
  })

  it('opens only the password screen on a temporary password', async () => {
    const calls = serve({ ...RESIDENT, role: 'staff', must_change_password: true })
    at('/desk/reports')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
    expect(calls.filter(call => !call.url.endsWith('/auth/me'))).toEqual([])
  })
})

describe('report drafts', () => {
  it('keeps each account to its own, and expires after 24 hours', async () => {
    fakeIndexedDB()
    await saveDraft('r1', draft())
    expect((await loadDraft('r1'))?.description).toBe('Knee-deep water.')
    expect(await loadDraft('r2')).toBeNull()
    expect(await loadDraft('r1', Date.now() + DRAFT_MAX_AGE_MS + 1000)).toBeNull()
    expect(await loadDraft('r1')).toBeNull()
  })

  it('removes other accounts when one opens the app, and everyone on sign-out', async () => {
    const rows = fakeIndexedDB()
    await saveDraft('r1', draft())
    await saveDraft('r2', draft())
    await keepOnlyDraftsOf('r2')
    expect([...rows.keys()]).toEqual(['r2'])
    await clearDraft('r2')
    expect(rows.size).toBe(0)
    await saveDraft('r2', draft())
    await clearAllDrafts()
    expect(rows.size).toBe(0)
    // The form saves what it holds as it closes; after signing out that must not land.
    await saveDraft('r2', draft())
    expect(rows.size).toBe(0)
  })

  it('does nothing when storage is missing or refuses', async () => {
    fakeIndexedDB(true)
    await saveDraft('r1', draft())
    expect(await loadDraft('r1')).toBeNull()
    vi.stubGlobal('indexedDB', undefined)
    expect(await loadDraft('r1')).toBeNull()
    serve(RESIDENT)
    at('/report')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Photo' })).toBeInTheDocument()
  })

  it('asks on return to the Report tab, and restores what was there', async () => {
    fakeIndexedDB()
    await saveDraft('r1', draft())
    serve(RESIDENT)
    at('/report')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Continue your report?' })).toBeInTheDocument()
    expect(screen.getByText(/Flooding · Location set/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('radio', { name: 'Flooding' })).toBeChecked()
    expect(screen.getByRole('textbox')).toHaveValue('Knee-deep water.')
  })

  it('still asks for the tick on restored AI text, even when the fresh AI answer fails', async () => {
    fakeIndexedDB()
    await saveDraft(
      'r1',
      draft({ step: 3, aiDescription: 'Knee-deep water.', aiCategory: 'flooding', locationSource: 'manual' }),
    )
    serve(RESIDENT, url => (url.endsWith('/reports/predict') ? Response.json({ detail: 'down' }, { status: 503 }) : []))
    at('/report')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    const send = await screen.findByRole('button', { name: /submit report/i })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(send).toBeEnabled()
  })

  it('needs no tick on a restored draft the resident filled in alone', async () => {
    fakeIndexedDB()
    await saveDraft('r1', draft({ step: 3 }))
    serve(RESIDENT)
    at('/report')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: /submit report/i })).toBeEnabled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('removes an expired draft when the app opens, whoever is signed in', async () => {
    const rows = fakeIndexedDB()
    await saveDraft('gone', draft({ savedAt: Date.now() - DRAFT_MAX_AGE_MS - 1000 }))
    await saveDraft('fresh', draft())
    serve(Response.json({ detail: 'Authentication required' }, { status: 401 }), () => ({ enabled: false }))
    render(<App />)
    await waitFor(() => expect([...rows.keys()]).toEqual(['fresh']))
  })

  it('stops saving after a sign-out in another tab', async () => {
    const rows = fakeIndexedDB()
    localStorage.setItem('barangai-drafts-closed', '1')
    await saveDraft('r1', draft())
    expect(rows.size).toBe(0)
    await keepOnlyDraftsOf('r1')
    await saveDraft('r1', draft())
    expect(rows.size).toBe(1)
  })

  it('starts clean, and wipes it, on Start over', async () => {
    const rows = fakeIndexedDB()
    await saveDraft('r1', draft())
    serve(RESIDENT)
    at('/report')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start over' }))
    expect(await screen.findByRole('heading', { name: 'Photo' })).toBeInTheDocument()
    await waitFor(() => expect(rows.size).toBe(0))
  })

  it("never offers another account's draft", async () => {
    const rows = fakeIndexedDB()
    await saveDraft('someone-else', draft())
    serve(RESIDENT)
    at('/report')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Photo' })).toBeInTheDocument()
    expect(screen.queryByText('Continue your report?')).not.toBeInTheDocument()
    await waitFor(() => expect(rows.size).toBe(0))
  })

  it('saves as the resident goes, wipes after sending and on sign-out', async () => {
    const rows = fakeIndexedDB()
    const calls = serve(RESIDENT, (url, call) => {
      if (url.endsWith('/reports') && call.method === 'POST') return { id: 'new12345', status: 'Pending' }
      if (url.includes('/nearby')) return { own: [], cases: [] }
      return []
    })
    at('/report')
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), {
      target: { files: [new File(['test'], 'road.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    await waitFor(() => expect((rows.get('r1') as ReportDraft | undefined)?.photo?.name).toBe('road.jpg'))
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    fireEvent.click(await screen.findByText('Enter coordinates manually'))
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '14.3294' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '120.9367' } })
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Potholes' }))
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    fireEvent.click(await screen.findByRole('button', { name: /submit report/i }))
    await screen.findByRole('heading', { name: 'Report sent' })
    await waitFor(() => expect(rows.size).toBe(0))
    expect(calls.some(call => call.method === 'POST' && call.url.endsWith('/reports'))).toBe(true)

    rows.set('r1', draft())
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Account and settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(rows.size).toBe(0))
  })
})

describe('the top of a report', () => {
  const report = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'abcd1234-0000-0000-0000-000000000000',
    status,
    resident_category: 'flooding',
    created_at: '2026-11-02T01:00:00+00:00',
    latitude: 14.3294,
    longitude: 120.9367,
    events: [{ id: 'e1', to_status: 'Pending', note: null, created_at: '2026-11-02T01:00:00+00:00' }],
    actions: [],
    ...extra,
  })
  function open(body: unknown) {
    fakeIndexedDB()
    serve(RESIDENT, url => (url.endsWith('/reports/abcd1234-0000-0000-0000-000000000000') ? body : []))
    at('/reports/abcd1234-0000-0000-0000-000000000000')
    render(<App />)
  }

  it.each([
    ['Pending', /look at your report next/],
    ['Under Verification', /checking your report/],
    ['Accepted', /moves to In Progress/],
    ['In Progress', /mark it Resolved/],
    ['Resolved', /marked this as fixed/],
    ['Rejected', /did not accept/],
  ])('says what happens next when %s, in both languages, with no date', async (status, line) => {
    open(report(status))
    const next = await screen.findByText(line)
    expect(next.textContent).not.toMatch(/\d|today|tomorrow|week/i)
    expect(filipino[next.textContent!]).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeInTheDocument()
  })

  it('shows the newest note a resident may read, from status changes or staff actions', async () => {
    open(
      report('In Progress', {
        events: [
          { id: 'e1', to_status: 'Accepted', note: 'Older status note', created_at: '2026-11-02T02:00:00+00:00' },
          { id: 'e2', to_status: 'In Progress', note: 'Crew assigned', created_at: '2026-11-02T03:00:00+00:00' },
        ],
        actions: [{ id: 'a1', kind: 'action', note: 'Sandbags placed', created_at: '2026-11-02T04:00:00+00:00' }],
      }),
    )
    const heading = await screen.findByRole('heading', { name: 'Latest note from staff' })
    expect(within(heading.parentElement!).getByText('Sandbags placed')).toBeInTheDocument()
  })

  it('shows the reason and a new report when rejected, with no way to reopen', async () => {
    open(
      report('Rejected', {
        events: [
          {
            id: 'e1',
            to_status: 'Rejected',
            rejection_reason: 'not_enough_details',
            note: 'The photo is too dark',
            created_at: '2026-11-02T02:00:00+00:00',
          },
        ],
      }),
    )
    const heading = await screen.findByRole('heading', { name: 'Reason from staff' })
    expect(within(heading.parentElement!).getByText('Not enough details or unclear photo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Make a new report' })).toHaveAttribute('href', '/report')
    expect(screen.queryByText(/reopen/i)).not.toBeInTheDocument()
  })

  it('offers a linked new report when resolved, filled with the category, pin and a reference in the text', async () => {
    open(report('Resolved', { verified_category: 'potholes' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Still not fixed? Report it again' }))
    await screen.findByRole('heading', { name: 'Photo' })
    fireEvent.change(screen.getByLabelText(/incident photo/i), {
      target: { files: [new File(['test'], 'road.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    expect(await screen.findByText('From your earlier report')).toBeInTheDocument()
    expect(leaflet.pins).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    expect(await screen.findByRole('radio', { name: 'Potholes' })).toBeChecked()
    expect(screen.getByRole('textbox')).toHaveValue('Still not fixed. Follow-up to report #ABCD1234.')
    // Nothing in the address, and the pin and carried category still need the resident's tick.
    expect(window.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    expect(await screen.findByRole('checkbox')).toBeInTheDocument()
  })

  it('never shows the automatic grouping line as a note from staff', async () => {
    open(
      report('Accepted', {
        events: [
          { id: 'e1', to_status: 'Accepted', note: 'Crew checked it', created_at: '2026-11-02T02:00:00+00:00' },
          {
            id: 'e2',
            to_status: 'Accepted',
            note: 'Your report was grouped with others about the same concern, so it now shares their status.',
            created_at: '2026-11-02T03:00:00+00:00',
          },
        ],
      }),
    )
    const heading = await screen.findByRole('heading', { name: 'Latest note from staff' })
    expect(within(heading.parentElement!).getByText('Crew checked it')).toBeInTheDocument()
  })

  it('keeps the tick for a carried category after the resident moves the pin', async () => {
    fakeIndexedDB()
    await saveDraft(
      'r1',
      draft({ step: 3, category: 'potholes', carriedCategory: 'potholes', locationSource: 'manual' }),
    )
    serve(RESIDENT)
    at('/report')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: /submit report/i })).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('gives staff no resident card', async () => {
    serve({ id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'North' }, url =>
      url.endsWith('/reports/abcd1234-0000-0000-0000-000000000000') ? report('Pending') : [],
    )
    at('/desk/reports/abcd1234-0000-0000-0000-000000000000')
    render(<App />)
    await screen.findByRole('heading', { name: 'Change status' })
    expect(screen.queryByText('What happens next')).not.toBeInTheDocument()
  })

  it('hides "Already reported" on a grouped case, where rejecting moves everyone', async () => {
    const staff = { id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'North' }
    const under = report('Under Verification', { case_id: 'c1', case_confirmed: true })
    serve(staff, url => {
      if (url.endsWith('/reports/abcd1234-0000-0000-0000-000000000000')) return under
      if (url.endsWith('/case')) return { case: null }
      return []
    })
    at('/desk/reports/abcd1234-0000-0000-0000-000000000000')
    render(<App />)
    const select = await screen.findByLabelText('Reason, if rejecting')
    fireEvent.click(select)
    expect(await screen.findByRole('option', { name: 'Not a barangay concern' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Already reported' })).not.toBeInTheDocument()
  })
})

describe('the location step', () => {
  async function atLocationStep() {
    fakeIndexedDB()
    serve(RESIDENT)
    at('/report')
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), {
      target: { files: [new File(['test'], 'road.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    return screen.findByRole('heading', { name: 'Location' })
  }

  it('moves focus to the step heading, says why Next is off, and announces the pin', async () => {
    const heading = await atLocationStep()
    expect(document.activeElement).toBe(heading)
    const button = screen.getByRole('button', { name: /^next/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/Set the location to continue/)
    fireEvent.click(screen.getByText('Enter coordinates manually'))
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '14.3294' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '120.9367' } })
    expect(button).toBeEnabled()
    expect(screen.queryByText(/Set the location to continue/)).not.toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"].sr-only')).toHaveTextContent(/^Location set: 14\.32940/)
  })

  it('tells GPS refused from GPS off', () => {
    expect(locationProblem({ code: 1 })).toMatch(/permission is off/)
    expect(locationProblem({ code: 'OS-PLUG-GLOC-0003', message: 'denied' })).toMatch(/permission is off/)
    expect(locationProblem({ code: 2 })).toMatch(/GPS is off/)
    expect(locationProblem({ code: 'OS-PLUG-GLOC-0007', message: 'Location services are not enabled.' })).toMatch(
      /GPS is off/,
    )
    expect(locationProblem({ code: 3 })).toMatch(/couldn't find you/)
    for (const reason of [{ code: 1 }, { code: 2 }, { code: 3 }]) expect(filipino[locationProblem(reason)]).toBeTruthy()
  })

  it('shows those messages on the step, including after the quiet attempt the photo starts', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'en',
      geolocation: { getCurrentPosition: (_ok: unknown, fail: (reason: unknown) => void) => fail({ code: 1 }) },
    })
    await atLocationStep()
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission is off/)
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (_ok: unknown, fail: (reason: unknown) => void) => fail({ code: 2 }) },
    })
    fireEvent.click(screen.getByRole('button', { name: /use gps/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/GPS is off/))
  })

  it('draws no pin until one is chosen, and says so when the map cannot load', async () => {
    await atLocationStep()
    fireEvent.click(screen.getByRole('button', { name: 'Adjust pin on map' }))
    expect(await screen.findByText('Tap the map to set the pin.')).toBeInTheDocument()
    expect(leaflet.pins).toBe(0)
    await waitFor(() => expect(leaflet.tileEvents.tileerror).toBeTruthy())
    act(() => leaflet.tileEvents.tileerror())
    expect(screen.getByText("Map can't load. Use GPS or enter the coordinates instead.")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Enter coordinates manually'))
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '14.3294' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '120.9367' } })
    await waitFor(() => expect(leaflet.pins).toBe(1))
  })
})

describe('getting help', () => {
  it('says who to ask about a forgotten password, in both languages', async () => {
    serve(Response.json({ detail: 'Authentication required' }, { status: 401 }), () => ({ enabled: false }))
    render(<App />)
    expect(await screen.findByText('Forgot your password? Ask your barangay hall.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }))
    expect(screen.queryByText('Forgot your password? Ask your barangay hall.')).not.toBeInTheDocument()
    expect(filipino['Forgot your password? Ask your barangay hall.']).toBeTruthy()
  })

  it('takes feedback from a resident under Account, and shows why it was refused', async () => {
    fakeIndexedDB()
    let answer: Response = Response.json(
      { detail: 'You sent feedback a moment ago. Try again in a few minutes.' },
      { status: 429 },
    )
    const calls = serve(RESIDENT, (url, call) => (url.endsWith('/feedback') && call.method === 'POST' ? answer : []))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Account and settings' }))
    fireEvent.click(await screen.findByText('Send feedback', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText('What should work better?'), { target: { value: 'The map is slow.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You sent feedback a moment ago')
    answer = Response.json({ id: 'f1' }, { status: 201 })
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    expect(await screen.findByText('Thank you. Your feedback was sent.')).toBeInTheDocument()
    expect(calls.filter(call => call.url.endsWith('/feedback')).at(-1)?.body).toEqual({ message: 'The map is slow.' })
  })

  it.each([
    [{ name: 'Barangay San Jose', contact: 'hall@example.test' }, /contact: Barangay San Jose · hall@example\.test/],
    [{ name: null, contact: null }, /ask your barangay hall/],
  ])('says who to contact when chat fails', async (operator, expected) => {
    fakeIndexedDB()
    serve(RESIDENT, (url, call) => {
      if (url.endsWith('/legal/operator')) return operator
      if (url.endsWith('/chat') && call.method === 'POST') return new TypeError('Failed to fetch')
      return []
    })
    at('/help')
    render(<App />)
    const input = await screen.findByLabelText('Message')
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/legal/operator'))).toBe(true),
    )
    await act(async () => {
      await new Promise(done => setTimeout(done, 20))
    })
    fireEvent.change(input, { target: { value: 'How do I report flooding?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(expected)).toBeInTheDocument()
  })

  it('lets an administrator delete a note, only after confirming', async () => {
    const calls = serve(
      { id: 'a1', email: 'boss@example.test', role: 'administrator', barangay: null },
      (url, call) => {
        if (url.endsWith('/admin/feedback/n1') && call.method === 'DELETE') return new Response(null, { status: 204 })
        if (url.endsWith('/admin/feedback'))
          return calls.some(item => item.method === 'DELETE')
            ? []
            : [{ id: 'n1', user_id: 'u1234567', message: 'Maria is noisy', created_at: '2026-11-02T01:00:00+00:00' }]
        return []
      },
    )
    at('/desk/help')
    render(<App />)
    await screen.findByText('Maria is noisy')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(calls.some(call => call.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByText('No feedback yet.')).toBeInTheDocument()
    expect(calls.filter(call => call.method === 'DELETE').map(call => call.url)).toEqual(['/api/admin/feedback/n1'])
  })
})

describe('translated labels', () => {
  const filipinoMode = () => localStorage.setItem('barangai-language', 'fil')

  it('names the sheet close button, Kap and the language switch in the language in use', async () => {
    filipinoMode()
    render(
      <LanguageProvider>
        <Kap pose="thinking" decorative={false} />
        <LanguageSwitch />
        <Sheet open>
          <SheetContent>
            <SheetTitle>Title</SheetTitle>
            <SheetDescription>Body</SheetDescription>
          </SheetContent>
        </Sheet>
      </LanguageProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Isara' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: filipino['English interface'], hidden: true })).toBeInTheDocument()
  })

  it('has a short Filipino label for the open-reports filter', () => {
    expect(filipino['Open reports'].length).toBeLessThanOrEqual(12)
  })
})

describe('page titles', () => {
  it.each([
    ['/home', 'Home · BarangAI'],
    ['/report', 'Report · BarangAI'],
    ['/reports', 'My reports · BarangAI'],
    ['/updates', 'Updates · BarangAI'],
    ['/help', 'Help · BarangAI'],
    ['/rewards', 'Rewards · BarangAI'],
    ['/community', 'Community map · BarangAI'],
  ])('names %s', async (path, title) => {
    fakeIndexedDB()
    serve(RESIDENT, url => (url.endsWith('/points') ? { balance: 0, entries: [] } : []))
    at(path)
    render(<App />)
    await waitFor(() => expect(document.title).toBe(title))
  })
})
