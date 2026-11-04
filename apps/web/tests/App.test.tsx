import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'

// Map lifecycle is covered in maps.test.tsx. Keep lazy imports inside this test's lifetime.
vi.mock('leaflet', () => ({
  map: () => {
    const map = { setView: () => map, fitBounds: vi.fn(), on: vi.fn(), stop: vi.fn(), remove: vi.fn() }
    return map
  },
  tileLayer: () => ({ addTo: vi.fn() }),
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

const photoFile = () => new File(['test'], 'road.jpg', { type: 'image/jpeg' })
const next = () => fireEvent.click(screen.getByRole('button', { name: /^next/i }))
async function fillLocation() {
  fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
  fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
}
const resident = () => Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
const at = (path: string) => window.history.replaceState(null, '', path)

describe('resident reporting', () => {
  beforeEach(() => at('/report'))

  it('shows a model suggestion while allowing a different resident category', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me')) return resident()
        if (url.endsWith('/reports/predict'))
          return Response.json({ prediction_available: true, model_category: 'potholes', confidence: 0.91 })
        return Response.json([])
      }),
    )
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photoFile()] } })
    expect(await screen.findByText(/AI suggests Potholes/i)).toBeInTheDocument()
    next()
    expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled()
    await fillLocation()
    next()
    expect(await screen.findByRole('radio', { name: 'Potholes' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Flooding' }))
    expect(screen.getByRole('radio', { name: 'Flooding' })).toBeChecked()
  })

  it('pre-fills category and description from the photo and lets the resident edit both', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me')) return resident()
        if (url.endsWith('/reports/predict'))
          return Response.json({
            prediction_available: true,
            model_category: 'flooding',
            confidence: 0.88,
            suggested_description: 'Water covers the road near the corner.',
          })
        return Response.json([])
      }),
    )
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photoFile()] } })
    expect(await screen.findByText(/AI suggests Flooding/i)).toBeInTheDocument()
    next()
    await fillLocation()
    next()
    expect(await screen.findByRole('radio', { name: 'Flooding' })).toBeChecked()
    const description = screen.getByRole('textbox')
    expect(description).toHaveValue('Water covers the road near the corner.')
    expect(screen.getAllByText('Filled by AI · you can edit')).toHaveLength(2)
    fireEvent.change(description, { target: { value: 'Knee-deep water since 6 AM.' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Potholes' }))
    expect(screen.queryByText('Filled by AI · you can edit')).not.toBeInTheDocument()
    expect(description).toHaveValue('Knee-deep water since 6 AM.')
  })

  it('requires a resident-selected category when AI is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me')) return resident()
        if (url.endsWith('/reports/predict')) return Response.json({ detail: 'down' }, { status: 503 })
        return Response.json([])
      }),
    )
    render(<App />)
    const input = await screen.findByLabelText(/incident photo/i)
    expect(input).toBeRequired()
    expect(input).not.toHaveAttribute('capture')
    fireEvent.change(input, { target: { files: [photoFile()] } })
    expect(await screen.findByText(/AI classification unavailable/i)).toBeInTheDocument()
    next()
    await fillLocation()
    next()
    expect(await screen.findByRole('radio', { name: 'Flooding' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled()
  })

  it.each(['Incident photo · Choose photo', 'Take photo'])(
    'submits a corrected category and photo from %s',
    async picker => {
      const requests: Array<{ url: string; init?: RequestInit }> = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input)
          requests.push({ url, init })
          if (url.endsWith('/auth/me')) return resident()
          if (url.endsWith('/reports') && init?.method === 'POST')
            return Response.json({ id: 'new', status: 'Pending' })
          return Response.json([])
        }),
      )
      render(<App />)
      fireEvent.change(await screen.findByLabelText(picker), { target: { files: [photoFile()] } })
      expect(screen.getByRole('status')).toHaveTextContent('Preparing photo…')
      await waitFor(() => expect(screen.getByLabelText(/incident photo/i)).not.toBeRequired())
      expect(screen.queryByText('Preparing photo…')).not.toBeInTheDocument()
      next()
      await fillLocation()
      next()
      fireEvent.click(await screen.findByRole('radio', { name: 'Potholes' }))
      next()
      // Nothing here was auto-filled (typed pin, chosen category), so no confirmation is asked for.
      fireEvent.click(await screen.findByRole('button', { name: /submit report/i }))
      await waitFor(() =>
        expect(requests.some(request => request.init?.method === 'POST' && request.url.endsWith('/reports'))).toBe(
          true,
        ),
      )
      const body = requests.find(request => request.init?.method === 'POST' && request.url.endsWith('/reports'))?.init
        ?.body as FormData
      expect(body.get('resident_category')).toBe('potholes')
      expect(body.get('latitude')).toBe('14.3')
      expect(body.get('longitude')).toBe('120.9')
      expect((body.get('image') as File).name).toBe('road.jpg')
      expect(await screen.findByRole('heading', { name: 'Report sent' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View my report' })).toHaveAttribute('href', '/reports/new')
      fireEvent.click(screen.getByRole('button', { name: 'Make another report' }))
      expect(await screen.findByLabelText(/incident photo/i)).toBeRequired()
    },
  )

  it('warns residents to keep away from exposed wiring', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith('/auth/me') ? resident() : Response.json([]))),
    )
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photoFile()] } })
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    next()
    await fillLocation()
    next()
    fireEvent.click(await screen.findByRole('radio', { name: 'Exposed wiring' }))
    expect(await screen.findByRole('note')).toHaveTextContent(/do not touch the wire/i)
  })

  it.each([
    ['phone.heic', 'image/heic', 4, 'HEIC photos are not supported. Choose JPG, PNG, or WebP, or take a new photo.'],
    ['large.jpg', 'image/jpeg', 25_000_001, 'Photo is too large. Choose a photo of 25 MB or less.'],
  ])('rejects %s before prediction or submission', async (name, type, bytes, message) => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        return url.endsWith('/auth/me') ? resident() : Response.json([])
      }),
    )
    render(<App />)
    const input = await screen.findByLabelText(/incident photo/i)
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(bytes)], name, { type })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(calls.some(url => url.endsWith('/reports/predict'))).toBe(false)
    expect(input).toBeRequired()
    expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled()
  })

  it('offers camera capture independently from existing photo selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith('/auth/me') ? resident() : Response.json([]))),
    )
    render(<App />)
    expect(await screen.findByLabelText('Take photo')).toHaveAttribute('capture', 'environment')
    expect(screen.getByLabelText(/incident photo/i)).not.toHaveAttribute('capture')
  })

  it('lets staff review a report and send a permitted status transition', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, init })
        if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
        if (url.endsWith('/reports/rep1/status')) return Response.json({ id: 'rep1', status: 'Under Verification' })
        if (url.endsWith('/reports/rep1/duplicates'))
          return Response.json({ embedding_available: false, suggestions: [], manual_review_required: true })
        if (url.endsWith('/reports/rep1'))
          return Response.json({ id: 'rep1', status: 'Pending', resident_category: 'flooding', events: [] })
        if (url.endsWith('/reports'))
          return Response.json([{ id: 'rep1', status: 'Pending', resident_category: 'flooding' }])
        throw Error(`unexpected ${url}`)
      }),
    )
    at('/desk/reports')
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: /review report/i }))
    expect(await screen.findByText(/duplicate suggestions unavailable/i)).toBeInTheDocument()
    const start = await screen.findByRole('button', { name: /start verification/i })
    expect(start).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/reason or description/i), { target: { value: 'Checking the site' } })
    fireEvent.click(start)
    await waitFor(() =>
      expect(calls.some(call => call.url.endsWith('/reports/rep1/status') && call.init?.method === 'POST')).toBe(true),
    )
    const body = JSON.parse(String(calls.find(call => call.url.endsWith('/reports/rep1/status'))?.init?.body))
    expect(body.status).toBe('Under Verification')
    expect(body.note).toBe('Checking the site')
  })

  it('shows backend history and records coordination and duplicate decisions', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, init })
        if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
        if (url.endsWith('/reports/rep2/duplicates'))
          return Response.json({
            embedding_available: true,
            suggestions: [{ id: 'dup1', candidate_report_id: 'rep1', score: 0.91, decision: 'pending' }],
            manual_review_required: true,
          })
        if (url.endsWith('/duplicates/dup1/decision')) return Response.json({ id: 'dup1', decision: 'confirmed' })
        if (url.endsWith('/reports/rep2/actions'))
          return Response.json({ id: 'action1', kind: 'coordination', note: 'Called office' })
        if (url.endsWith('/reports/rep2'))
          return Response.json({
            id: 'rep2',
            status: 'Resolved',
            resident_category: 'potholes',
            events: [{ id: 'event1', to_status: 'Resolved', created_at: '2026-10-14T00:00:00Z' }],
            actions: [],
          })
        if (url.endsWith('/reports'))
          return Response.json([{ id: 'rep2', status: 'Resolved', resident_category: 'potholes' }])
        throw Error(`unexpected ${url}`)
      }),
    )
    at('/desk/reports')
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: /review report/i }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Report details' })).getByText('Resolved', { selector: 'strong' }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByLabelText(/record type/i))
    fireEvent.click(screen.getByRole('option', { name: 'External coordination' }))
    fireEvent.change(screen.getByLabelText(/^note$/i), { target: { value: 'Called office' } })
    fireEvent.submit(screen.getByRole('button', { name: /save action/i }).closest('form')!)
    await waitFor(() =>
      expect(calls.some(call => call.url.endsWith('/reports/rep2/actions') && call.init?.method === 'POST')).toBe(true),
    )
    const action = JSON.parse(
      String(
        calls.find(call => call.url.endsWith('/reports/rep2/actions') && call.init?.method === 'POST')?.init?.body,
      ),
    )
    expect(action).toEqual({ kind: 'coordination', note: 'Called office' })
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm same incident/i })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /confirm same incident/i }))
    await waitFor(() =>
      expect(calls.some(call => call.url.endsWith('/duplicates/dup1/decision') && call.init?.method === 'POST')).toBe(
        true,
      ),
    )
  })
})

describe('staff overview', () => {
  it('shows counts and filters the review list by status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
        if (url.endsWith('/reports'))
          return Response.json([
            {
              id: 'r1',
              status: 'Pending',
              resident_category: 'flooding',
              latitude: 14.5,
              longitude: 121,
              created_at: '2026-10-14T03:00:00Z',
            },
            {
              id: 'r2',
              status: 'Resolved',
              resident_category: 'potholes',
              latitude: 14.6,
              longitude: 121.1,
              created_at: '2026-10-13T03:00:00Z',
            },
          ])
        throw Error(`unexpected ${url}`)
      }),
    )
    at('/desk')
    render(<App />)
    expect(await screen.findByText('Operations overview')).toBeInTheDocument()
    // Only the pending report needs attention on the overview.
    expect(await screen.findAllByRole('link', { name: /flooding/i })).toHaveLength(1)
    fireEvent.click(screen.getByRole('link', { name: 'Reports' }))
    expect(await screen.findAllByRole('link', { name: /review report/i })).toHaveLength(2)
    fireEvent.click(screen.getByLabelText('Filter by status'))
    fireEvent.click(screen.getByRole('option', { name: 'Pending' }))
    expect(screen.getAllByRole('link', { name: /review report/i })).toHaveLength(1)
    expect(screen.getByText('1 of 2 reports')).toBeInTheDocument()
  })
})

describe('routing', () => {
  it('keeps staff filters in the URL across opening and closing a report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
        if (url.endsWith('/reports/r1/duplicates'))
          return Response.json({ embedding_available: false, suggestions: [], manual_review_required: true })
        if (url.endsWith('/reports/r1'))
          return Response.json({ id: 'r1', status: 'Pending', resident_category: 'flooding', events: [] })
        if (url.endsWith('/reports'))
          return Response.json([
            { id: 'r1', status: 'Pending', resident_category: 'flooding' },
            { id: 'r2', status: 'Resolved', resident_category: 'potholes' },
          ])
        throw Error(`unexpected ${url}`)
      }),
    )
    at('/desk/reports')
    render(<App />)
    await screen.findAllByRole('link', { name: /review report/i })
    fireEvent.click(screen.getByLabelText('Filter by status'))
    fireEvent.click(screen.getByRole('option', { name: 'Pending' }))
    fireEvent.click(screen.getByRole('link', { name: /review report/i }))
    expect(window.location.pathname).toBe('/desk/reports/r1')
    fireEvent.click(await screen.findByRole('button', { name: 'Close details' }))
    expect(window.location.pathname + window.location.search).toBe('/desk/reports?status=Pending')
    expect(screen.getAllByRole('link', { name: /review report/i })).toHaveLength(1)
  })

  it('opens a deep-linked report for residents and closes back to their list', async () => {
    window.history.replaceState(null, '', '/reports/rep9')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me'))
          return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
        if (url.endsWith('/reports/rep9'))
          return Response.json({ id: 'rep9', status: 'Accepted', resident_category: 'exposed_wiring', events: [] })
        if (url.endsWith('/reports')) return Response.json([])
        throw Error(`unexpected ${url}`)
      }),
    )
    render(<App />)
    expect(
      await within(await screen.findByRole('dialog')).findByRole('heading', { name: 'Exposed wiring' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(window.location.pathname).toBe('/reports')
  })
})

describe('roles and session', () => {
  const user = (role: string) => Response.json({ id: role, email: `${role}@example.test`, role })

  it.each([
    ['resident', '/desk', '/home'],
    ['staff', '/reports/x', '/desk'],
  ])('redirects a %s away from %s', async (role, path, landing) => {
    window.history.replaceState(null, '', path)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith('/auth/me') ? user(role) : Response.json([]))),
    )
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe(landing))
  })

  it('shows residents no staff controls and never asks for duplicates', async () => {
    window.history.replaceState(null, '', '/reports/rep1')
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/auth/me')) return user('resident')
        if (url.endsWith('/reports/rep1'))
          return Response.json({ id: 'rep1', status: 'Under Verification', resident_category: 'potholes', events: [] })
        return Response.json([])
      }),
    )
    render(<App />)
    await within(await screen.findByRole('dialog')).findByRole('heading', { name: 'Potholes' })
    expect(screen.queryByText('Change status')).not.toBeInTheDocument()
    expect(screen.queryByText('Document work')).not.toBeInTheDocument()
    expect(screen.queryByText('Potential duplicates')).not.toBeInTheDocument()
    expect(calls.some(url => url.includes('duplicates'))).toBe(false)
  })

  it('drops cached reports on sign-out so the next account never sees them', async () => {
    let signedIn = 'staff'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/auth/logout')) {
          signedIn = ''
          return new Response(null, { status: 204 })
        }
        if (url.endsWith('/auth/login')) {
          signedIn = 'resident'
          return user('resident')
        }
        if (url.endsWith('/auth/me')) return signedIn ? user(signedIn) : new Response('{}', { status: 401 })
        if (url.endsWith('/auth/google/config')) return Response.json({ enabled: false })
        if (url.endsWith('/reports'))
          return Response.json(
            signedIn === 'staff'
              ? [{ id: 'secret1', status: 'Pending', resident_category: 'flooding', description: 'Staff-only row' }]
              : [],
          )
        throw Error(`unexpected ${init?.method ?? 'GET'} ${url}`)
      }),
    )
    at('/desk/reports')
    render(<App />)
    expect(await screen.findByText('Staff-only row')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account and settings' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'resident@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    fireEvent.click(await screen.findByRole('link', { name: 'My reports' }))
    expect(await screen.findByText('No reports yet')).toBeInTheDocument()
    expect(screen.queryByText('Staff-only row')).not.toBeInTheDocument()
  })

  it('clears what was typed when switching between sign in and create account', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Not signed in' }), { status: 401 })),
    )
    render(<App />)
    const email = await screen.findByLabelText('Email address')
    fireEvent.change(email, { target: { value: 'resident@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic password' } })
    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }))
    expect(screen.getByLabelText('Email address')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Already registered? Sign in' }))
    expect(screen.getByLabelText('Email address')).toHaveValue('')
  })

  it('refetches notifications when the window regains focus', async () => {
    window.history.replaceState(null, '', '/updates')
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        return url.endsWith('/auth/me') ? user('resident') : Response.json([])
      }),
    )
    render(<App />)
    await screen.findByText('No updates yet.')
    const before = calls.filter(url => url.endsWith('/notifications')).length
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(calls.filter(url => url.endsWith('/notifications')).length).toBeGreaterThan(before))
  })
})

describe('resident notifications', () => {
  it('shows unread status changes and marks them read', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (url.endsWith('/auth/me'))
          return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
        if (url.endsWith('/notifications/n1/read'))
          return Response.json({
            id: 'n1',
            report_id: 'rep1',
            status: 'Under Verification',
            created_at: '2026-10-14T03:00:00Z',
            read_at: '2026-10-14T03:10:00Z',
          })
        if (url.endsWith('/notifications'))
          return Response.json([
            {
              id: 'n1',
              report_id: 'rep1',
              status: 'Under Verification',
              created_at: '2026-10-14T03:00:00Z',
              read_at: null,
            },
          ])
        if (url.endsWith('/reports')) return Response.json([])
        throw Error(`unexpected ${url}`)
      }),
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: /Updates/ }))
    expect(await screen.findByText('Under Verification')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }))
    await waitFor(() => expect(calls.some(call => call === 'POST /api/notifications/n1/read')).toBe(true))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument())
  })
})

describe('interface language', () => {
  it('switches resident controls to Filipino', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me'))
          return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
        if (url.endsWith('/notifications') || url.endsWith('/reports')) return Response.json([])
        throw Error(`unexpected ${url}`)
      }),
    )
    at('/report')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Account and settings' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Filipino' }))
    expect(await screen.findByRole('button', { name: 'Mag-sign out' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gumawa ng ulat', level: 1, hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Susunod/, hidden: true })).toBeInTheDocument()
  })
})

describe('optional Google sign-in', () => {
  it.each([true, false])('only offers Google when configured: %s', async enabled => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/google/config')
          ? Response.json({ enabled })
          : new Response('{}', { status: 401 }),
      ),
    )
    render(<App />)
    await screen.findByRole('heading', { name: 'Sign in' })
    if (enabled)
      expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
        'href',
        '/api/auth/google/start',
      )
    else expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })
})

describe('localized feedback', () => {
  it('translates duplicate review labels and reports an unavailable photograph', async () => {
    localStorage.setItem('barangai-language', 'fil')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
        if (url.endsWith('/reports/rep1/duplicates'))
          return Response.json({
            embedding_available: true,
            suggestions: [{ id: 'dup1', candidate_report_id: 'other', score: 0.91, decision: 'pending' }],
            manual_review_required: true,
          })
        const report = { id: 'rep1', status: 'Pending', resident_category: 'flooding', events: [] }
        return Response.json(url.endsWith('/reports') ? [report] : report)
      }),
    )
    at('/desk/reports')
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'I-review ang ulat: Baha' }))
    expect(await screen.findByText(/Similarity 0.91/)).toHaveTextContent('Hinihintay')
    fireEvent.error(screen.getByAltText('Na-submit na ulat'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hindi ma-load ang photo. Isara at buksan ulit ang ulat.',
    )
  })

  it('shows a Filipino login error', async () => {
    localStorage.setItem('barangai-language', 'fil')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/google/config')
          ? Response.json({ enabled: false })
          : Response.json({ detail: 'Invalid credentials' }, { status: 401 }),
      ),
    )
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'demo@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'incorrect' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Mag-sign in' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Hindi tama ang email o password.')
  })
})
