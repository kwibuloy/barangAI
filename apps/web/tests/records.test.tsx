import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  previous: {
    from: '2026-09-01',
    to: '2026-09-30',
    received: { reports: 9, incidents: 8 },
    accepted: { reports: 8, incidents: 6 },
    resolved: { reports: 7, incidents: 5 },
    rejected: { reports: 2, incidents: 2 },
    median_hours_to_accept: 5.5,
    median_hours_to_resolve: 48,
  },
}
const NO_ACTIVITY = {
  from: '2026-07-01',
  to: '2026-07-31',
  received: { reports: 0, incidents: 0 },
  accepted: { reports: 0, incidents: 0 },
  resolved: { reports: 0, incidents: 0 },
  rejected: { reports: 0, incidents: 0 },
  median_hours_to_accept: null,
  median_hours_to_resolve: null,
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
  await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2))
  expect(screen.queryByText('Why reports were rejected')).toBeNull()
})

it('says how each figure changed in words, with no colour to read', async () => {
  backend(figures)
  window.history.replaceState(null, '', '/desk/records?month=2026-10')
  render(<App />)
  const received = (await screen.findByText('Reports received')).closest('div') as HTMLElement
  expect(within(received).getByText('3 more than last month')).toBeTruthy()
  expect(received.querySelector('svg')).toBeTruthy()
  expect(screen.getByText('2 fewer than last month')).toBeTruthy()
  expect(screen.getAllByText('Same as last month')).toHaveLength(2)
  expect(screen.getByText('2 hours faster than last month')).toBeTruthy()
  // Slower by two days: read aloud as days, like the figures themselves.
  expect(screen.getByText('2 days slower than last month')).toBeTruthy()
  // Never coloured by good or bad: all of them share the page's text colour.
  expect(screen.getByText('2 days slower than last month').closest('p')?.className).toContain('text-foreground')
  expect(screen.getByText('3 more than last month').closest('p')?.className).toContain('text-foreground')
  expect(screen.getByText(/Compared with last month/).textContent).toContain('1 Sept')
})

it('shows a dash when there is nothing to compare with', async () => {
  backend({ ...figures, previous: NO_ACTIVITY })
  window.history.replaceState(null, '', '/desk/records?month=2026-08')
  render(<App />)
  await screen.findByText('Typical time to accept')
  expect(screen.getAllByText('—')).toHaveLength(6)
  expect(screen.queryByText(/last month:/)).toBeNull()
  expect(screen.queryByText(/more than last month/)).toBeNull()
})

const ROW = (barangay: string | null, received: number, resolved: number, time: number | null, open: number) => ({
  barangay,
  received: { reports: received, incidents: received - 1 },
  resolved: { reports: resolved, incidents: resolved },
  median_hours_to_resolve: time,
  open_over_30_days: open,
})

function adminBackend() {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/me'))
        return Response.json({ id: 'a1', email: 'admin@example.test', role: 'administrator' })
      if (url.includes('/staff/records/rollup'))
        return Response.json({
          rows: [
            ROW('Burol', 5, 2, 96, 0),
            ROW('Salawag', 9, 7, null, 1),
            ROW('Zapote', 2, 1, 24, 3),
            ROW(null, 1, 0, null, 0),
          ],
          total: ROW(null, 17, 10, 60, 4),
          quiet_barangays: 71,
        })
      if (url.includes('/staff/records')) return Response.json(figures)
      return Response.json([])
    }),
  )
  return calls
}

it('gives administrators a rollup by name, sortable, with its own spreadsheet', async () => {
  const calls = adminBackend()
  window.history.replaceState(null, '', '/desk/records?month=2026-10')
  render(<App />)
  const title = await screen.findByText(/Rollup by barangay/)
  expect(calls.some(url => url.includes('/staff/records/rollup?from=2026-10-01&to=2026-10-31'))).toBe(true)
  const card = title.closest('[data-slot="card"]') as HTMLElement
  const names = () =>
    within(card)
      .getAllByRole('row')
      .slice(1)
      .map(row => within(row).getAllByRole('cell')[0].textContent)
  expect(names()).toEqual(['Burol', 'Salawag', 'Zapote', 'Outside every boundary', 'All barangays'])
  const header = within(card).getByRole('columnheader', { name: 'Reports received' })
  expect(header).toHaveAttribute('aria-sort', 'none')
  fireEvent.click(within(header).getByRole('button'))
  expect(header).toHaveAttribute('aria-sort', 'descending')
  expect(names()).toEqual(['Salawag', 'Burol', 'Zapote', 'Outside every boundary', 'All barangays'])
  fireEvent.click(within(header).getByRole('button'))
  expect(names()[0]).toBe('Outside every boundary')
  // Nothing measured stays last, whichever way a time column runs.
  fireEvent.click(
    within(within(card).getByRole('columnheader', { name: 'Typical time to resolve' })).getByRole('button'),
  )
  expect(names().slice(0, 2)).toEqual(['Burol', 'Zapote'])
  fireEvent.click(within(within(card).getByRole('columnheader', { name: 'Barangay' })).getByRole('button'))
  fireEvent.click(within(within(card).getByRole('columnheader', { name: 'Barangay' })).getByRole('button'))
  expect(names()).toEqual(['Zapote', 'Salawag', 'Burol', 'Outside every boundary', 'All barangays'])
  expect(within(card).getByRole('link', { name: 'Download rollup' }).getAttribute('href')).toBe(
    '/api/staff/records/rollup.csv?from=2026-10-01&to=2026-10-31',
  )
  expect(within(card).getByText(/71/)).toBeTruthy()
  expect(within(card).getByText(/An incident counts reports staff grouped as one/)).toBeTruthy()
})

it('keeps the rollup away from staff', async () => {
  const calls = backend(figures)
  window.history.replaceState(null, '', '/desk/records?month=2026-10')
  render(<App />)
  await screen.findByText('Typical time to accept')
  expect(screen.queryByText(/Rollup by barangay/)).toBeNull()
  expect(calls.some(url => url.includes('rollup'))).toBe(false)
})

it('labels demo data in the desk and on the printed report, and only then', async () => {
  const calls = backend(figures)
  window.history.replaceState(null, '', '/desk/records?month=2026-10')
  const { unmount } = render(<App />)
  await screen.findByText('Typical time to accept')
  expect(screen.queryByText('Demo data')).toBeNull()
  expect(calls.some(url => url.includes('/legal/operator'))).toBe(true)
  unmount()
  cleanup()
  vi.unstubAllGlobals()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me'))
        return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'Salawag' })
      if (url.endsWith('/legal/operator')) return Response.json({ name: null, contact: null, demo_mode: true })
      if (url.includes('/staff/records')) return Response.json(figures)
      return Response.json([])
    }),
  )
  render(<App />)
  expect(await screen.findByText('Demo data')).toBeTruthy()
  // Hidden on screen and shown on paper, where the shell's chip isn't.
  const printed = await screen.findByText('Demo data: synthetic, not real records')
  expect(printed.closest('span')?.className).toContain('print:inline-flex')
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
