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

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  localStorage.clear()
})

type Call = { url: string; method: string; body?: Record<string, unknown> }
const staff = { id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'North' }
const admin = { id: 'a1', email: 'boss@example.test', role: 'administrator', barangay: null }
const at = (path: string) => window.history.replaceState(null, '', path)
const report = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  resident_category: 'flooding',
  created_at: '2026-11-02T01:00:00+00:00',
  ...extra,
})

function serve(me: unknown, routes: (url: string, call: Call) => unknown) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const call: Call = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      calls.push(call)
      if (url.endsWith('/auth/me')) return Response.json(me)
      if (url.includes('/staff/brief')) return Response.json({ detail: 'Not here' }, { status: 404 })
      if (url.endsWith('/boundaries')) return Response.json({ type: 'FeatureCollection', features: [] })
      const answer = routes(url, call)
      if (answer instanceof Response) return answer
      return Response.json(answer ?? [])
    }),
  )
  return calls
}

const posted = (calls: Call[], ending: string) => calls.filter(c => c.method !== 'GET' && c.url.endsWith(ending))

it('blocks everything behind the password change until a temporary password is replaced', async () => {
  const calls = serve({ ...staff, must_change_password: true }, url => {
    if (url.endsWith('/auth/password')) return new Response(null, { status: 204 })
    return []
  })
  at('/desk')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
  expect(document.title).toBe('Change password · BarangAI')
  expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
  expect(calls.some(call => call.url.endsWith('/reports'))).toBe(false)
  fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'temporary-password' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'my-own-long-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByRole('link', { name: 'Reports' })).toBeInTheDocument()
  expect(posted(calls, '/auth/password')[0].body).toEqual({
    current_password: 'temporary-password',
    new_password: 'my-own-long-password',
  })
})

it('shows the staff accounts page to administrators only', async () => {
  serve(staff, () => [])
  at('/desk/accounts')
  render(<App />)
  expect(await screen.findByText('Operations overview')).toBeInTheDocument()
  expect(window.location.pathname).toBe('/desk')
  expect(screen.queryByRole('link', { name: 'Staff accounts' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Help' }).length).toBeGreaterThan(0)
})

function accountsBackend() {
  return serve(admin, (url, call) => {
    if (url.endsWith('/admin/barangays')) return [{ id: 'b1', name: 'North' }]
    if (url.endsWith('/admin/server-address'))
      return { addresses: [{ url: 'http://192.168.1.20:8000', listening: true }] }
    if (url.endsWith('/reset-password')) return { temporary_password: 'reset-password-xyz' }
    if (url.endsWith('/admin/staff') && call.method === 'POST')
      return call.body?.email === 'used@example.test'
        ? Response.json({ detail: 'Email already registered' }, { status: 409 })
        : Response.json({ id: 'n1', email: call.body?.email, temporary_password: 'one-time-password' }, { status: 201 })
    if (url.endsWith('/admin/staff/s1') && call.method === 'PATCH') return { id: 's1' }
    if (url.endsWith('/admin/staff'))
      return [
        { id: 'a1', email: 'boss@example.test', role: 'administrator', barangay: null, disabled: false },
        { id: 's1', email: 'staff@example.test', role: 'staff', barangay: 'North', disabled: false },
      ]
    return []
  })
}

it('adds an account and shows the one-time password once, with who to give it to and how', async () => {
  const calls = accountsBackend()
  at('/desk/accounts')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Staff accounts' })).toBeInTheDocument()
  expect(document.title).toBe('Staff accounts · BarangAI')
  expect(await screen.findByText('http://192.168.1.20:8000')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'used@example.test' } })
  fireEvent.click(await screen.findByLabelText('Barangay'))
  fireEvent.click(await screen.findByRole('option', { name: 'North' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
  expect(await screen.findByText('Email already registered')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
  expect(await screen.findByText('one-time-password')).toBeInTheDocument()
  expect(screen.getByText(/Give this in person/)).toBeInTheDocument()
  expect(posted(calls, '/admin/staff').at(-1)?.body).toEqual({
    email: 'new@example.test',
    role: 'staff',
    barangay: 'North',
  })

  const clipboard = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
  fireEvent.click(screen.getByRole('button', { name: 'Copy: Temporary password' }))
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith('one-time-password'))

  fireEvent.click(screen.getByRole('button', { name: "I've given it" }))
  expect(screen.queryByText('one-time-password')).not.toBeInTheDocument()
})

it('asks before disabling or resetting, and never offers either on your own account', async () => {
  const calls = accountsBackend()
  at('/desk/accounts')
  render(<App />)
  const disable = await screen.findByRole('button', { name: 'Disable: staff@example.test' })
  expect(screen.queryByRole('button', { name: 'Disable: boss@example.test' })).not.toBeInTheDocument()

  fireEvent.click(disable)
  expect(posted(calls, '/admin/staff/s1')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(posted(calls, '/admin/staff/s1')).toHaveLength(0)

  fireEvent.click(screen.getByRole('button', { name: 'Disable: staff@example.test' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, disable' }))
  await waitFor(() => expect(posted(calls, '/admin/staff/s1')[0]?.body).toEqual({ disabled: true }))

  fireEvent.click(await screen.findByRole('button', { name: 'Reset password: staff@example.test' }))
  expect(posted(calls, '/reset-password')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Yes, reset' }))
  expect(await screen.findByText('reset-password-xyz')).toBeInTheDocument()
})

function checklist({ staffAccount = true, reports = [] as unknown[], barangays = [{ id: 'b1', name: 'North' }] }) {
  return serve(admin, url => {
    if (url.endsWith('/admin/barangays')) return barangays
    if (url.endsWith('/admin/staff'))
      return staffAccount ? [{ id: 's1', email: 's@example.test', role: 'staff', barangay: 'North' }] : []
    if (url.endsWith('/admin/server-address')) return { addresses: [{ url: 'http://10.0.0.5:8000', listening: false }] }
    if (url.endsWith('/reports')) return reports
    return []
  })
}

it('lists what a new barangay still needs, from real data, and says when phones cannot reach it', async () => {
  checklist({ staffAccount: false })
  at('/desk')
  render(<App />)
  const card = (await screen.findByText('Get your barangay started')).closest('[data-slot="card"]') as HTMLElement
  expect(within(card).getByText('Done:')).toBeInTheDocument()
  expect(within(card).getByText(/Add one under Staff accounts/)).toBeInTheDocument()
  expect(within(card).getByText(/Set up a resident's phone/)).toBeInTheDocument()
  expect(await within(card).findByText('http://10.0.0.5:8000')).toBeInTheDocument()
  expect(within(card).getByRole('alert')).toHaveTextContent('-Lan')
})

it('hides the checklist once the required steps are done, even with no reward', async () => {
  checklist({ reports: [report('r1', 'Pending')] })
  at('/desk')
  render(<App />)
  expect(await screen.findByText('Operations overview')).toBeInTheDocument()
  await screen.findByRole('link', { name: /flooding/i })
  await waitFor(() => expect(screen.queryByText('Get your barangay started')).not.toBeInTheDocument())
})

it('hides the checklist from staff, who cannot read what it needs', async () => {
  const calls = serve(staff, () => [])
  at('/desk')
  render(<App />)
  expect(await screen.findByText('Operations overview')).toBeInTheDocument()
  expect(screen.queryByText('Get your barangay started')).not.toBeInTheDocument()
  expect(calls.some(call => call.url.includes('/admin/'))).toBe(false)
})

const GROUPED = [
  report('p1', 'Pending', { case_id: 'c1', case_confirmed: true, verified_category: null }),
  report('p2', 'Pending', { case_id: 'c1', case_confirmed: true, created_at: '2026-11-03T01:00:00+00:00' }),
  report('v1', 'Under Verification', { resident_category: 'potholes', verified_category: 'flooding' }),
  report('a1', 'Accepted', { resident_category: 'potholes', verified_category: 'potholes' }),
  report('w1', 'In Progress', { resident_category: 'potholes' }),
  report('d1', 'Resolved', { resident_category: 'other' }),
  report('x1', 'Rejected', { resident_category: 'other' }),
]

it('opens from each Overview figure a list of exactly that many rows', async () => {
  // Both lazy routes load before the clock matters: under a parallel run their first load can eat the wait for rows.
  await Promise.all([import('../src/features/staff/QueuePage'), import('../src/features/staff/OverviewPage')])
  serve(staff, url => (url.endsWith('/reports') ? GROUPED : []))
  at('/desk')
  render(<App />)
  const rows = () => screen.getAllByRole('link', { name: /^Review report/ })
  const figures = [
    ['Waiting for review', 2, '/desk/reports?status=Pending,Under+Verification'],
    ['Being worked on', 2, '/desk/reports?status=Accepted,In+Progress'],
    ['Resolved', 1, '/desk/reports?status=Resolved'],
    ['Total reports', 6, '/desk/reports?status=all'],
  ] as const
  for (const [title, count, href] of figures) {
    const link = (await screen.findAllByRole('link', { name: new RegExp(title) }))[0]
    await waitFor(() => expect(link).toHaveTextContent(String(count)))
    expect(link).toHaveAttribute('href', href)
    fireEvent.click(link)
    await waitFor(() => expect(rows()).toHaveLength(count))
    fireEvent.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByText('Operations overview')
  }
}, 60_000) // Four round trips through two heavy pages.

it('labels the category figures and counts the verified category over the resident one', async () => {
  serve(staff, url => (url.endsWith('/reports') ? GROUPED : []))
  at('/desk')
  render(<App />)
  expect(await screen.findByText(/Staff-verified category where there is one/)).toBeInTheDocument()
  const potholes = (await screen.findAllByText('Potholes')).at(-1)!.closest('li') as HTMLElement
  // Two: the accepted one and the one still in progress. The third potholes report was verified as flooding.
  await waitFor(() => expect(within(potholes).getByText('2')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Show as a table'))
  expect(screen.getByRole('columnheader', { name: 'New reports' })).toBeInTheDocument()
})

it('shows open reports by default with a clear way to see all, and searches street and barangay', async () => {
  serve(staff, url =>
    url.endsWith('/reports')
      ? [
          report('r1', 'Pending', { location_label: 'Mabini Street', barangay: 'North' }),
          report('r2', 'Accepted', { location_label: 'Rizal Avenue', barangay: 'South', verified_category: 'other' }),
          report('r3', 'Resolved'),
        ]
      : [],
  )
  at('/desk/reports')
  render(<App />)
  const rows = () => screen.getAllByRole('link', { name: /^Review report/ })
  await waitFor(() => expect(rows()).toHaveLength(2))
  expect(document.title).toBe('Reports · BarangAI')
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'mabini' } })
  await waitFor(() => expect(rows()).toHaveLength(1))
  fireEvent.change(search, { target: { value: 'south' } })
  await waitFor(() => expect(rows()[0]).toHaveAttribute('href', expect.stringContaining('r2')))
  fireEvent.change(search, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'See all reports' }))
  await waitFor(() => expect(rows()).toHaveLength(3))
  expect(window.location.search).toBe('?status=all')
  fireEvent.click(screen.getByRole('button', { name: 'Open reports only' }))
  await waitFor(() => expect(rows()).toHaveLength(2))
})

it('names each queue row by more than its category and shows a lazy photo', async () => {
  serve(staff, url =>
    url.endsWith('/reports')
      ? [
          report('aaaaaaaa-1', 'Pending', { priority: { level: 'high', score: 90, reasons: [] } }),
          report('bbbbbbbb-1', 'Under Verification'),
        ]
      : [],
  )
  at('/desk/reports')
  render(<App />)
  const first = await screen.findByRole('link', { name: /Pending.*High priority.*#AAAAAAAA/ })
  expect(screen.getByRole('link', { name: /Under Verification.*#BBBBBBBB/ })).toBeInTheDocument()
  const photo = first.querySelector('img') as HTMLImageElement
  expect(photo).toHaveAttribute('src', '/api/reports/aaaaaaaa-1/image')
  expect(photo).toHaveAttribute('loading', 'lazy')
  fireEvent.error(photo)
  expect(first.querySelector('img')).toBeNull()
})

function reviewBackend() {
  const list = [report('r1', 'Under Verification'), report('r2', 'Pending')]
  return serve(staff, url => {
    if (url.endsWith('/status')) return report('r1', 'Accepted')
    if (url.endsWith('/duplicates')) return { embedding_available: false, suggestions: [] }
    if (url.endsWith('/case')) return { case: null }
    if (url.endsWith('/reports/r1')) return { ...list[0], events: [] }
    if (url.endsWith('/reports/r2')) return { ...list[1], events: [] }
    if (url.endsWith('/reports')) return list
    return []
  })
}

it('fills the note from a chip, keeps it editable, saves and moves to the next report, and announces it', async () => {
  const calls = reviewBackend()
  at('/desk/reports/r1')
  render(<App />)
  expect(document.title).toBe('Report details · BarangAI')
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmed from the photo' }))
  const note = screen.getByLabelText(/Reason or description/i) as HTMLTextAreaElement
  expect(note.value).toBe('We confirmed this problem from a photo and pin. It is now on our work list.')
  fireEvent.change(note, { target: { value: `${note.value} Crew comes Monday.` } })
  fireEvent.click(screen.getByRole('button', { name: 'Accept and next' }))
  await waitFor(() => expect(posted(calls, '/reports/r1/status')).toHaveLength(1))
  expect(posted(calls, '/reports/r1/status')[0].body).toMatchObject({
    status: 'Accepted',
    note: 'We confirmed this problem from a photo and pin. It is now on our work list. Crew comes Monday.',
  })
  await waitFor(() => expect(window.location.pathname).toBe('/desk/reports/r2'))
  const statuses = await screen.findAllByRole('status')
  expect(statuses.some(item => /#R1.*Accepted.*The resident can see your note/.test(item.textContent ?? ''))).toBe(true)
})

it('never sends a ready-made note under the opposite decision', async () => {
  reviewBackend()
  at('/desk/reports/r1')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Nothing found' }))
  expect(screen.getByRole('button', { name: 'Accept report' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Accept and next' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reject report' })).not.toBeDisabled()
  expect(screen.getByText(/This note is for: Reject report/)).toBeInTheDocument()
  // Once staff write their own words, the choice is theirs again.
  fireEvent.change(screen.getByLabelText(/Reason or description/i), { target: { value: 'My own words' } })
  expect(screen.getByRole('button', { name: 'Accept report' })).not.toBeDisabled()
})

it('offers bulk start only the words true of a report nobody has opened', async () => {
  serve(staff, url => (url.endsWith('/reports') ? [report('r1', 'Pending')] : []))
  at('/desk/reports')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Select several' }))
  expect(screen.getByRole('button', { name: 'Checking the photo' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Visiting the place' })).not.toBeInTheDocument()
})

it('offers a rejection chip that also picks the reason, and saves an untouched phrase in English', async () => {
  localStorage.setItem('barangai-language', 'fil')
  const calls = reviewBackend()
  at('/desk/reports/r1')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Walang nakita' }))
  const note = screen.getByLabelText(/Dahilan o description/i) as HTMLTextAreaElement
  expect(note.value).toBe('Pinuntahan namin ang lugar at hindi namin nakita ang problemang ito.')
  fireEvent.click(screen.getByRole('button', { name: 'Hindi tanggapin' }))
  await waitFor(() => expect(posted(calls, '/reports/r1/status')).toHaveLength(1))
  expect(posted(calls, '/reports/r1/status')[0].body).toMatchObject({
    status: 'Rejected',
    rejection_reason: 'no_problem_found',
    note: 'We went to the place and did not find this problem.',
  })
})

it('starts verification on several reports with one note and shows which ones failed', async () => {
  const calls = serve(staff, url => {
    if (url.endsWith('/reports/r2/status'))
      return Response.json({ detail: 'Invalid status transition' }, { status: 409 })
    if (url.endsWith('/status')) return report('r1', 'Under Verification')
    if (url.endsWith('/reports'))
      return [report('r1', 'Pending'), report('r2', 'Pending'), report('r3', 'Accepted'), report('r4', 'Pending')]
    return []
  })
  at('/desk/reports')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Select several' }))
  // Only Pending reports can be selected.
  expect(screen.queryByLabelText(/Select report #R3/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText(/Select report #R1/))
  fireEvent.click(screen.getByLabelText(/Select report #R2/))
  const start = screen.getByRole('button', { name: 'Start verification' })
  expect(start).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Checking the photo' }))
  fireEvent.click(start)
  await waitFor(() => expect(posted(calls, '/reports/r2/status')).toHaveLength(1))
  expect(posted(calls, '/reports/r1/status')[0].body).toEqual({
    status: 'Under Verification',
    note: 'We received your report and are checking the photo and the pin.',
  })
  expect(posted(calls, '/reports/r4/status')).toHaveLength(0)
  expect(await screen.findByRole('alert')).toHaveTextContent('#R2: Invalid status transition')
  expect(screen.getByText('Verification started on 1 reports.')).toBeInTheDocument()
})

const summary = (id: string, extra = {}) => ({
  id,
  status: 'Pending',
  resident_category: 'flooding',
  verified_category: null,
  created_at: '2026-11-02T01:00:00+00:00',
  location_label: null,
  image_url: `/api/reports/${id}/image`,
  ...extra,
})

function duplicateBackend(decision: string) {
  return serve(staff, (url, call) => {
    if (url.endsWith('/cases/link'))
      return call.body?.confirm_far
        ? { case: { id: 'c1' } }
        : Response.json(
            {
              detail: {
                code: 'confirm_far',
                message: 'These reports are far apart or in different categories. Confirm to group them anyway.',
                reasons: ['far', 'category'],
                distance_m: 2200,
                categories: ['flooding', 'potholes'],
              },
            },
            { status: 409 },
          )
    if (url.endsWith('/duplicates'))
      return {
        embedding_available: true,
        manual_review_required: true,
        report: summary('rep1'),
        suggestions: [
          {
            id: 'dup1',
            candidate_report_id: 'cand1',
            score: 0.91,
            decision,
            distance_m: 2200,
            candidate: summary('cand1', {
              verified_category: 'potholes',
              status: 'Accepted',
              location_label: 'Rizal Avenue',
            }),
          },
        ],
      }
    if (url.endsWith('/case')) return { case: null }
    if (url.endsWith('/reports/rep1')) return { ...report('rep1', 'Pending'), events: [] }
    if (url.endsWith('/reports')) return [report('rep1', 'Pending')]
    return []
  })
}

it('compares both reports side by side in duplicate review, with a link to the other one', async () => {
  duplicateBackend('pending')
  at('/desk/reports/rep1')
  render(<App />)
  expect(await screen.findByText(/2200 m apart/)).toBeInTheDocument()
  expect(screen.getByAltText('This report: Flooding')).toHaveAttribute('src', '/api/reports/rep1/image')
  expect(screen.getByAltText('#CAND1: Potholes')).toHaveAttribute('src', '/api/reports/cand1/image')
  expect(screen.getByText('Resident chose:')).toBeInTheDocument()
  expect(screen.getByText('Verified:')).toBeInTheDocument()
  expect(screen.getByText('Rizal Avenue')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open report' })).toHaveAttribute('href', '/desk/reports/cand1')
})

it('asks staff to confirm a far-apart link, then sends it again with their answer', async () => {
  const calls = duplicateBackend('confirmed')
  at('/desk/reports/rep1')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Group into one case' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('These reports are 2200 m apart.')
  expect(alert).toHaveTextContent('Flooding / Potholes')
  expect(posted(calls, '/cases/link')).toHaveLength(1)
  fireEvent.click(within(alert).getByRole('button', { name: 'Group them anyway' }))
  await waitFor(() => expect(posted(calls, '/cases/link')).toHaveLength(2))
  expect(posted(calls, '/cases/link')[1].body).toEqual({
    report_id: 'rep1',
    other_report_id: 'cand1',
    confirm_far: true,
  })
  await waitFor(() => expect(screen.queryByText('Group them anyway')).not.toBeInTheDocument())
})

it('shows administrators the rewards log and finds one code', async () => {
  const calls = serve(admin, url => {
    if (url.includes('/admin/rewards/log'))
      return {
        reward_changes: [
          {
            id: 'c1',
            reward: 'Rice voucher',
            barangay: 'North',
            actor_id: 's1',
            action: 'changed',
            changes: { points_cost: [100, 250] },
            created_at: '2026-11-02T01:00:00+00:00',
          },
        ],
        vouchers: [
          {
            id: 'v1',
            code: 'ABCD2345',
            status: 'used',
            reward: 'Rice voucher',
            barangay: 'North',
            points_cost: 250,
            redeemed_by: 'resident-id-1',
            redeemed_at: '2026-11-02T01:00:00+00:00',
            expires_at: '2026-12-02T01:00:00+00:00',
            honoured_by: 's1',
            honoured_at: '2026-11-03T01:00:00+00:00',
          },
        ],
      }
    if (url.endsWith('/admin/staff')) return [{ id: 's1', email: 'desk@example.test', role: 'staff' }]
    return []
  })
  at('/desk/rewards')
  render(<App />)
  expect(await screen.findByText('ABCD2345')).toBeInTheDocument()
  expect(await screen.findAllByText(/desk@example.test/)).toHaveLength(2)
  expect(screen.getByText('Points: 100 → 250')).toBeInTheDocument()
  // Residents stay a short id, not an address.
  expect(screen.getByText('#RESIDENT')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Find a code'), { target: { value: 'abcd 2345' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find' }))
  await waitFor(() => expect(calls.some(call => call.url.includes('code=abcd%202345'))).toBe(true))
})

it('keeps the rewards log from staff', async () => {
  const calls = serve(staff, () => [])
  at('/desk/rewards')
  render(<App />)
  expect(await screen.findByText("Use a resident's code")).toBeInTheDocument()
  expect(screen.queryByText('Rewards log')).not.toBeInTheDocument()
  expect(calls.some(call => call.url.includes('/admin/'))).toBe(false)
})

it('explains grouped points and points owed to residents, and only when there are any', async () => {
  const points = {
    balance: 10,
    owed: 15,
    history: [{ id: 'e1', kind: 'merge', amount: -25, created_at: '2026-11-02' }],
  }
  serve({ id: 'r1', email: 'r@example.test', role: 'resident' }, url => {
    if (url.endsWith('/points')) return points
    if (url.endsWith('/vouchers')) return { available: [], history: [] }
    return []
  })
  at('/rewards')
  const { unmount } = render(<App />)
  expect(await screen.findByText(/15 points to settle/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'History' }))
  expect(await screen.findByText('Grouped reports settled')).toBeInTheDocument()
  unmount()
  cleanup()
  points.owed = 0
  render(<App />)
  expect(await screen.findByText('10')).toBeInTheDocument()
  expect(screen.queryByText(/points to settle/)).not.toBeInTheDocument()
})

it('sends feedback from the staff help page and shows what the API says', async () => {
  let replies = 0
  const calls = serve(staff, url => {
    if (url.endsWith('/legal/operator')) return { name: null, contact: null }
    if (url.endsWith('/feedback'))
      return replies++
        ? Response.json({ detail: 'You sent feedback a moment ago. Try again in a few minutes.' }, { status: 429 })
        : Response.json({ id: 'f1', created_at: '2026-11-02' }, { status: 201 })
    return []
  })
  at('/desk/help')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Help' })).toBeInTheDocument()
  expect(document.title).toBe('Help · BarangAI')
  expect(screen.queryByText('Feedback received')).not.toBeInTheDocument()
  expect(calls.some(call => call.url.endsWith('/admin/feedback'))).toBe(false)
  const box = screen.getByLabelText('What should work better?')
  expect(box).toHaveAttribute('maxlength', '1000')
  fireEvent.change(box, { target: { value: '  The map is slow. ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
  expect(await screen.findByText('Thank you. Your feedback was sent.')).toBeInTheDocument()
  expect(posted(calls, '/feedback')[0].body).toEqual({ message: 'The map is slow.' })
  fireEvent.change(box, { target: { value: 'One more' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('moment ago')
})

it('shows administrators the feedback received', async () => {
  serve(admin, url => {
    if (url.endsWith('/legal/operator')) return { name: 'Synthetic Operator', contact: 'help@example.test' }
    if (url.endsWith('/admin/feedback'))
      return [{ id: 'f1', user_id: 'abcdefgh-1', message: 'The map is slow.', created_at: '2026-11-02T01:00:00+00:00' }]
    return []
  })
  at('/desk/help')
  render(<App />)
  expect(await screen.findByText('The map is slow.')).toBeInTheDocument()
  expect(screen.getByText('#ABCDEFGH')).toBeInTheDocument()
  expect(await screen.findByText('Synthetic Operator · help@example.test')).toBeInTheDocument()
})
