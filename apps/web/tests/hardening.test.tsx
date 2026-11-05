import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'

vi.mock('leaflet', () => ({
  map: () => {
    const map = { setView: () => map, fitBounds: vi.fn(), on: vi.fn(), stop: vi.fn(), remove: vi.fn() }
    return map
  },
  tileLayer: () => ({ addTo: vi.fn(), on: vi.fn() }),
  circleMarker: () => {
    const marker = { addTo: () => marker, setLatLng: vi.fn(), bindTooltip: vi.fn(), on: vi.fn() }
    return marker
  },
}))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  localStorage.clear()
})

type Call = { url: string; init?: RequestInit }
const resident = { id: 'r1', email: 'resident@example.test', role: 'resident' }
const staff = { id: 's1', email: 'staff@example.test', role: 'staff' }
const at = (path: string) => window.history.replaceState(null, '', path)
const next = () => fireEvent.click(screen.getByRole('button', { name: /^next/i }))

function serve(routes: (url: string, init?: RequestInit) => unknown) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      const answer = routes(url, init)
      return answer instanceof Response ? answer : Response.json(answer ?? [])
    }),
  )
  return calls
}

const ownReport = {
  id: 'own12345-0000-0000-0000-000000000000',
  status: 'Pending',
  resident_category: 'flooding',
  created_at: '2026-11-02T01:00:00+00:00',
  distance_m: 40,
}

async function reachReview() {
  fireEvent.change(await screen.findByLabelText(/incident photo/i), {
    target: { files: [new File(['x'], 'road.jpg', { type: 'image/jpeg' })] },
  })
  await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
  next()
  fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
  fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
  next()
  fireEvent.click(await screen.findByRole('radio', { name: 'Flooding' }))
  next()
  await screen.findByRole('button', { name: /submit report/i })
}

describe('already reported', () => {
  it('offers to add the photo to the resident’s own open report instead of a second report', async () => {
    at('/report')
    const calls = serve((url, init) => {
      if (url.endsWith('/auth/me')) return resident
      if (url.includes('/nearby')) return { own: [ownReport], cases: [] }
      if (url.endsWith('/addenda') && init?.method === 'POST')
        return { id: 'a1', note: 'x', created_at: ownReport.created_at, image_url: null }
      if (url.endsWith(`/reports/${ownReport.id}`)) return { ...ownReport, events: [] }
      return []
    })
    render(<App />)
    await reachReview()
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    expect(await screen.findByRole('heading', { name: 'You already reported this' })).toBeInTheDocument()
    expect(screen.getByText(/#OWN12345/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to my report' }))
    await waitFor(() => expect(calls.some(call => call.url.endsWith(`/reports/${ownReport.id}/addenda`))).toBe(true))
    const body = calls.find(call => call.url.endsWith('/addenda'))!.init!.body as FormData
    expect((body.get('image') as File).name).toBe('road.jpg')
    expect(body.get('note')).toBe('Another photo of the same problem.')
    // No second report was created.
    expect(calls.some(call => call.url.endsWith('/api/reports') && call.init?.method === 'POST')).toBe(false)
    await waitFor(() => expect(window.location.pathname).toBe(`/reports/${ownReport.id}`))
  })

  it('still sends a new report when the resident says it is a different problem', async () => {
    at('/report')
    const calls = serve((url, init) => {
      if (url.endsWith('/auth/me')) return resident
      if (url.includes('/nearby')) return { own: [ownReport], cases: [] }
      if (url.endsWith('/reports') && init?.method === 'POST') return { id: 'new', status: 'Pending' }
      return []
    })
    render(<App />)
    await reachReview()
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    fireEvent.click(await screen.findByRole('button', { name: /different problem/i }))
    expect(await screen.findByRole('heading', { name: 'Report sent' })).toBeInTheDocument()
    expect(calls.filter(call => call.url.endsWith('/reports') && call.init?.method === 'POST')).toHaveLength(1)
  })
})

describe('added details', () => {
  it('lets a resident add a note to their open report and shows earlier additions', async () => {
    at(`/reports/${ownReport.id}`)
    const report = {
      ...ownReport,
      events: [],
      addenda: [
        { id: 'a0', note: 'Synthetic: water reached the gate.', created_at: ownReport.created_at, image_url: null },
      ],
    }
    const calls = serve((url, init) => {
      if (url.endsWith('/auth/me')) return resident
      if (url.endsWith('/addenda') && init?.method === 'POST')
        return { id: 'a1', note: 'Higher now', created_at: ownReport.created_at, image_url: null }
      if (url.endsWith(`/reports/${ownReport.id}`)) return report
      if (url.endsWith('/reports')) return [report]
      return []
    })
    render(<App />)
    expect(await screen.findByText('Synthetic: water reached the gate.')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Add details' }))
    fireEvent.change(screen.getByPlaceholderText(/what changed/i), { target: { value: 'Higher now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to staff' }))
    expect(await screen.findByText(/Barangay staff were notified/)).toBeInTheDocument()
    expect((calls.find(call => call.url.endsWith('/addenda'))!.init!.body as FormData).get('note')).toBe('Higher now')
  })
})

describe('staff tools', () => {
  const flagged = {
    id: 'rep1',
    status: 'Pending',
    resident_category: 'flooding',
    events: [],
    location_source: 'manual',
    trust_flags: [
      { code: 'pin_far_from_photo', detail: 420 },
      { code: 'old_photo', detail: 30 },
    ],
  }

  it('shows photo checks in the queue and on the report', async () => {
    at('/desk/reports/rep1')
    serve(url => {
      if (url.endsWith('/auth/me')) return staff
      if (url.endsWith('/duplicates'))
        return { embedding_available: false, suggestions: [], manual_review_required: true }
      if (url.endsWith('/reports/rep1')) return flagged
      if (url.endsWith('/reports')) return [flagged]
      return []
    })
    render(<App />)
    expect(await screen.findByText('The pin is 420 m from where the photo was taken.')).toBeInTheDocument()
    expect(screen.getByText('The photo was taken 30 days before it was sent.')).toBeInTheDocument()
    expect(screen.getByText('Pin placed by hand')).toBeInTheDocument()
    expect(screen.getAllByText('Check photo').length).toBeGreaterThan(0)
  })

  it('lists new reports and added details under Updates', async () => {
    at('/desk/updates')
    serve(url => {
      if (url.endsWith('/auth/me')) return staff
      if (url.endsWith('/notifications'))
        return [
          {
            id: 'n1',
            report_id: 'rep1',
            status: 'Pending',
            kind: 'addendum',
            created_at: '2026-11-02T01:00:00Z',
            read_at: null,
          },
          {
            id: 'n2',
            report_id: 'rep1',
            status: 'Pending',
            kind: 'new_report',
            created_at: '2026-11-02T00:00:00Z',
            read_at: null,
          },
        ]
      if (url.endsWith('/reports')) return [flagged]
      return []
    })
    render(<App />)
    expect(await screen.findByText('A resident added details')).toBeInTheDocument()
    expect(screen.getByText('New report')).toBeInTheDocument()
    expect(screen.getByText('2 unread')).toBeInTheDocument()
  })

  it('shows Kap’s brief with the reports to look at first', async () => {
    at('/desk')
    serve(url => {
      if (url.endsWith('/auth/me')) return staff
      if (url.includes('/staff/brief'))
        return {
          summary: '2 open reports, 1 waiting for review.',
          source: 'workers_ai',
          generated_at: '2026-11-02T00:00:00Z',
          facts: {
            open: 2,
            waiting: 1,
            new_today: 1,
            resolved_today: 0,
            waiting_over_a_day: 0,
            high_priority: [{ id: 'rep9', category: 'exposed_wiring', place: 'Mabini Street', score: 7 }],
            high_priority_count: 1,
            hotspot: null,
          },
        }
      return []
    })
    render(<App />)
    expect(await screen.findByText('2 open reports, 1 waiting for review.')).toBeInTheDocument()
    expect(screen.getByText("Worded by AI from today's numbers")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Exposed wiring · Mabini Street/ })).toHaveAttribute(
      'href',
      '/desk/reports/rep9',
    )
  })
})

describe('saved preferences', () => {
  it('applies the account’s language and theme on sign-in without saving them back', async () => {
    at('/home')
    const calls = serve((url, init) => {
      if (url.endsWith('/auth/me')) return { ...resident, preferences: { language: 'fil', theme: 'dark' } }
      if (url.endsWith('/auth/preferences') && init?.method === 'PUT') return { ...resident, preferences: {} }
      return []
    })
    render(<App />)
    await waitFor(() => expect(document.documentElement.lang).toBe('fil'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    // Nothing differs from the account yet, so nothing is saved back.
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(calls.some(call => call.url.endsWith('/auth/preferences'))).toBe(false)
  })
})
