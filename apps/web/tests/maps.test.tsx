import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/app/App'

const maps = vi.hoisted(() => ({ instances: [] as any[], borders: [] as any[] }))
vi.mock('leaflet', () => ({
  map: vi.fn((_element, options) => {
    const lifecycle: string[] = []
    const instance = {
      options,
      lifecycle,
      setView: vi.fn(function () {
        return instance
      }),
      fitBounds: vi.fn(),
      on: vi.fn(),
      stop: vi.fn(() => lifecycle.push('stop')),
      remove: vi.fn(() => lifecycle.push('remove')),
    }
    maps.instances.push(instance)
    return instance
  }),
  tileLayer: () => ({ addTo: vi.fn() }),
  circleMarker: () => {
    const marker = { addTo: () => marker, setLatLng: vi.fn(), bindTooltip: vi.fn(), on: vi.fn() }
    return marker
  },
  geoJSON: (data: unknown, options: unknown) => {
    const layer = { addTo: () => layer, bringToBack: vi.fn(), remove: vi.fn() }
    maps.borders.push({ data, options, layer })
    return layer
  },
}))
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  maps.instances.length = 0
  maps.borders.length = 0
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('stops staff maps before replacing or removing them and avoids zoom transitions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/auth/me')
        ? Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
        : Response.json([
            { id: 'a', status: 'Pending', resident_category: 'flooding', latitude: 14.3, longitude: 120.9 },
            { id: 'b', status: 'Resolved', resident_category: 'flooding', latitude: 14.4, longitude: 121 },
          ]),
    ),
  )
  window.history.replaceState(null, '', '/desk/map')
  render(<App />)
  await screen.findByLabelText('Filter by status')
  await waitFor(() => expect(maps.instances.some(map => map.fitBounds.mock.calls.length)).toBe(true))
  const active = maps.instances[maps.instances.length - 1]
  expect(active.options).toMatchObject({ zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
  expect(active.fitBounds.mock.calls[0][1]).toMatchObject({ animate: false })
  fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'Pending' } })
  await waitFor(() => expect(active.lifecycle).toEqual(['stop', 'remove']))
  const replacement = maps.instances[maps.instances.length - 1]
  cleanup()
  expect(replacement.lifecycle).toEqual(['stop', 'remove'])
})

it('opens and closes a resident map without leaving animated transitions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/auth/me')
        ? Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
        : Response.json([]),
    ),
  )
  window.history.replaceState(null, '', '/report')
  render(<App />)
  fireEvent.change(await screen.findByLabelText(/incident photo/i), {
    target: { files: [new File(['x'], 'road.jpg', { type: 'image/jpeg' })] },
  })
  await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /^next/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Adjust pin on map' }))
  await waitFor(() => expect(maps.instances.length).toBe(1))
  const map = maps.instances[0]
  expect(map.options).toMatchObject({ zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
  fireEvent.click(screen.getByRole('button', { name: 'Hide map' }))
  expect(map.lifecycle).toEqual(['stop', 'remove'])
})

const reportRows = [
  {
    id: 'a',
    status: 'Pending',
    resident_category: 'flooding',
    latitude: 14.34,
    longitude: 120.97,
    barangay: 'Salawag',
  },
  {
    id: 'b',
    status: 'Pending',
    resident_category: 'potholes',
    latitude: 14.3,
    longitude: 120.99,
    barangay: 'Paliparan II',
  },
  { id: 'c', status: 'Pending', resident_category: 'other', latitude: 15.5, longitude: 121, barangay: null },
]
const border = { type: 'Feature', properties: { name: 'Salawag' }, geometry: { type: 'Polygon', coordinates: [] } }

function backend(role: string, extra: Record<string, unknown> = {}, rows: unknown[] = reportRows) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return Response.json({ id: 'u1', email: 'user@example.test', role })
      const match = Object.keys(extra).find(path => url.includes(path))
      if (match) return Response.json(extra[match])
      return Response.json(url.includes('/reports') ? rows : [])
    }),
  )
}

it('draws barangay borders under the pins without taking their clicks', async () => {
  backend('staff', { '/barangays/boundaries': { type: 'FeatureCollection', features: [border] } })
  window.history.replaceState(null, '', '/desk/map')
  render(<App />)
  await waitFor(() => expect(maps.borders.length).toBeGreaterThan(0))
  const drawn = maps.borders[maps.borders.length - 1]
  expect(drawn.options).toMatchObject({ interactive: false })
  expect(drawn.options.attribution).toContain('NAMRIA')
  expect(drawn.layer.bringToBack).toHaveBeenCalled()
})

it('lets administrators filter the queue by barangay, including reports outside every boundary', async () => {
  backend('administrator')
  window.history.replaceState(null, '', '/desk/reports')
  render(<App />)
  const filter = await screen.findByLabelText('Filter by barangay')
  expect(screen.getAllByRole('link', { name: /^Review report/ })).toHaveLength(3)
  fireEvent.change(filter, { target: { value: 'Salawag' } })
  await waitFor(() => expect(screen.getAllByRole('link', { name: /^Review report/ })).toHaveLength(1))
  expect(screen.getByRole('link', { name: /Flooding/ })).toBeInTheDocument()
  fireEvent.change(filter, { target: { value: 'outside' } })
  await waitFor(() => expect(screen.getByRole('link', { name: /Other/ })).toBeInTheDocument())
  expect(screen.getAllByRole('link', { name: /^Review report/ })).toHaveLength(1)
})

it('hides the barangay filter from staff, and from administrators before boundaries are loaded', async () => {
  backend('staff')
  window.history.replaceState(null, '', '/desk/reports?barangay=outside')
  const staff = render(<App />)
  await screen.findByLabelText('Filter by status')
  await waitFor(() => expect(screen.getAllByRole('link', { name: /^Review report/ })).toHaveLength(3))
  expect(screen.queryByLabelText('Filter by barangay')).toBeNull()
  staff.unmount()
  backend(
    'administrator',
    {},
    reportRows.map(row => ({ ...row, barangay: null })),
  )
  render(<App />)
  await waitFor(() => expect(screen.getAllByRole('link', { name: /^Review report/ })).toHaveLength(3))
  expect(screen.queryByLabelText('Filter by barangay')).toBeNull()
})

async function placePin() {
  window.history.replaceState(null, '', '/report')
  render(<App />)
  fireEvent.change(await screen.findByLabelText(/incident photo/i), {
    target: { files: [new File(['x'], 'road.jpg', { type: 'image/jpeg' })] },
  })
  await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /^next/i }))
  fireEvent.change(await screen.findByLabelText('Latitude'), { target: { value: '15.5' } })
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '121' } })
}

it('warns a resident about a pin outside the covered area but still lets them continue', async () => {
  backend('resident', { '/barangays/locate': { active: true, barangay: null } })
  await placePin()
  expect(await screen.findByText(/outside the area we cover/i, {}, { timeout: 2000 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled()
})

it('names the barangay of a pin inside the covered area', async () => {
  backend('resident', { '/barangays/locate': { active: true, barangay: 'Salawag' } })
  await placePin()
  expect(await screen.findByText(/Salawag/, {}, { timeout: 2000 })).toBeInTheDocument()
  expect(screen.queryByText(/outside the area we cover/i)).toBeNull()
})

it('shows no warning before any barangay is loaded', async () => {
  const seen: string[] = []
  backend('resident', { '/barangays/locate': { active: false, barangay: null } })
  const stub = vi.mocked(fetch).getMockImplementation()!
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input))
      return stub(input, init)
    }),
  )
  await placePin()
  await waitFor(() => expect(seen.some(url => url.includes('/barangays/locate'))).toBe(true), { timeout: 2000 })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(screen.queryByText(/outside the area we cover/i)).toBeNull()
})
