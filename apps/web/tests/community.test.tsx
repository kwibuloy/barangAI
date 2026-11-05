import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/app/App'

vi.mock('leaflet', () => {
  const map = { setView: () => map, fitBounds: vi.fn(), on: vi.fn(), stop: vi.fn(), remove: vi.fn() }
  const layer = { addTo: () => layer, bringToBack: vi.fn(), remove: vi.fn() }
  return {
    map: () => map,
    geoJSON: () => layer,
    tileLayer: () => ({ addTo: vi.fn(), on: vi.fn() }),
    circleMarker: () => {
      const marker = { addTo: () => marker, bindTooltip: vi.fn(), on: vi.fn() }
      return marker
    },
  }
})

const openCase = {
  id: 'case-1',
  category: 'broken_streetlights',
  status: 'In Progress',
  latitude: 14.3,
  longitude: 120.9,
  location_label: 'Synthetic Street',
  first_reported_on: '2026-10-20',
  last_reported_on: '2026-10-28',
  contributors: 3,
  open_for_evidence: true,
  contributed: false,
}

function residentApi(cases: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
      if (url.endsWith('/cases/map')) return Response.json(cases)
      return Response.json([])
    }),
  )
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

it('shows accepted cases with contributor counts and offers "I see this too"', async () => {
  residentApi([openCase, { ...openCase, id: 'case-2', status: 'Resolved', open_for_evidence: false }])
  window.history.replaceState(null, '', '/community')
  render(<App />)
  const row = await screen.findByRole('button', { name: /Synthetic Street/ })
  // Only open issues by default; the resolved one waits behind the filter.
  expect(screen.getAllByRole('button', { name: /Synthetic Street/ })).toHaveLength(1)
  fireEvent.click(row)
  const card = screen.getByRole('region', { name: 'Selected issue' })
  expect(within(card).getByText('3')).toBeInTheDocument()
  expect(within(card).getByRole('link', { name: 'I see this too' })).toHaveAttribute('href', '/report?case=case-1')
  expect(screen.getByText(/never shown here/)).toBeInTheDocument()
})

it('tells residents they already reported a case instead of offering it again', async () => {
  residentApi([{ ...openCase, contributed: true }])
  window.history.replaceState(null, '', '/community')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /Synthetic Street/ }))
  expect(screen.getByText('You reported this issue.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'I see this too' })).toBeNull()
})

it('marks the report form as evidence for the chosen case, and lets the resident drop it', async () => {
  residentApi([openCase])
  window.history.replaceState(null, '', '/report?case=case-1')
  render(<App />)
  expect(await screen.findByText(/Adding to/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Report a separate issue instead' }))
  expect(screen.queryByText(/Adding to/)).toBeNull()
})

function fixedApi(fixed: unknown, urls: string[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/auth/me')) return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
      if (url.endsWith('/cases/map')) return Response.json([openCase])
      if (url.includes('/barangays/boundaries'))
        return Response.json({ type: 'FeatureCollection', features: [{ properties: { name: 'Salawag' } }] })
      if (url.includes('/barangays/fixed')) return Response.json(fixed)
      return Response.json([])
    }),
  )
  return urls
}

it("shows what the pin's barangay fixed this month, from counts alone", async () => {
  const urls = fixedApi({
    barangay: 'Salawag',
    enough: true,
    resolved_incidents: 12,
    typical_days: 3.5,
    categories: [{ category: 'potholes', incidents: 5 }],
  })
  window.history.replaceState(null, '', '/community')
  render(<App />)
  expect(await screen.findByText('12')).toBeInTheDocument()
  expect(screen.getByText('What your barangay fixed')).toBeInTheDocument()
  expect(screen.getByText('Issues fixed this month')).toBeInTheDocument()
  expect(screen.getByText('Typical time to fix')).toBeInTheDocument()
  expect(screen.getByText(/Potholes/)).toBeInTheDocument()
  expect(urls.some(url => url.includes('/barangays/fixed?lat=14.3&lng=120.9'))).toBe(true)
})

it('says not enough yet below the threshold, with no figures', async () => {
  fixedApi({ barangay: 'Salawag', enough: false, resolved_incidents: null, typical_days: null, categories: [] })
  window.history.replaceState(null, '', '/community')
  render(<App />)
  expect(await screen.findByText(/Not enough yet this month/)).toBeInTheDocument()
  expect(screen.queryByText('Issues fixed this month')).toBeNull()
})

it('shows no summary at all before barangays are loaded', async () => {
  residentApi([openCase])
  window.history.replaceState(null, '', '/community')
  render(<App />)
  await screen.findByRole('button', { name: /Synthetic Street/ })
  expect(screen.queryByText('What your barangay fixed')).toBeNull()
})
