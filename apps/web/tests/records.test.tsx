import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/app/App'

vi.mock('leaflet', () => {
  const layer = {
    addTo: () => layer,
    bringToBack: vi.fn(),
    remove: vi.fn(),
    setLatLng: vi.fn(),
    bindTooltip: vi.fn(),
    on: vi.fn(),
  }
  const map = { setView: () => map, fitBounds: vi.fn(), on: vi.fn(), stop: vi.fn(), remove: vi.fn() }
  return { map: () => map, tileLayer: () => layer, circleMarker: () => layer, geoJSON: () => layer }
})

const figures = {
  barangay: 'Salawag',
  received: { reports: 12, incidents: 9 },
  accepted: { reports: 8, incidents: 6 },
  resolved: { reports: 5, incidents: 4 },
  rejected: { reports: 2, incidents: 2 },
  median_hours_to_accept: 3.5,
  median_hours_to_resolve: 96,
  verified_categories: [{ category: 'potholes', reports: 7 }],
  not_yet_verified: 3,
  rejection_reasons: [{ reason: 'no_problem_found', reports: 2 }],
  open_now: { up_to_7_days: 4, '8_to_30_days': 2, over_30_days: 1, total: 7 },
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  localStorage.clear()
})

function backend(records: unknown) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/me'))
        return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'Salawag' })
      if (url.includes('/staff/records')) return Response.json(records)
      return Response.json([])
    }),
  )
  return calls
}

it('shows the month the API counted, and offers it as a spreadsheet and for printing', async () => {
  const calls = backend(figures)
  window.history.replaceState(null, '', '/desk/records')
  render(<App />)
  expect(await screen.findByText('Typical time to accept')).toBeTruthy()
  expect(screen.getByText('3.5 hours')).toBeTruthy()
  expect(screen.getByText('4 days')).toBeTruthy()
  expect(screen.getByText('9 incidents')).toBeTruthy()
  expect(screen.getByText('No problem found when checked')).toBeTruthy()
  const link = screen.getByRole('link', { name: 'Download spreadsheet' })
  expect(link.getAttribute('href')).toMatch(/^\/api\/staff\/records\.csv\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/)
  expect(calls.some(url => url.includes('/staff/records?from='))).toBe(true)
  expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy()
})

it('says nothing was measured when a month has no finished reports', async () => {
  backend({
    ...figures,
    median_hours_to_accept: null,
    median_hours_to_resolve: null,
    verified_categories: [],
    rejection_reasons: [],
  })
  window.history.replaceState(null, '', '/desk/records')
  render(<App />)
  await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(2))
  expect(screen.queryByText('Why reports were rejected')).toBeNull()
})

it('tells a staff account with no barangay why its desk is empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
      if (url.includes('/barangays/boundaries')) return Response.json({ type: 'FeatureCollection', features: [{}] })
      return Response.json([])
    }),
  )
  window.history.replaceState(null, '', '/desk')
  render(<App />)
  expect((await screen.findByRole('alert')).textContent).toContain("isn't assigned to a barangay")
})
