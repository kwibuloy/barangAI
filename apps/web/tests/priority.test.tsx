import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/app/App'

const newer = {
  id: 'aaaa1111-0000-0000-0000-000000000000',
  status: 'Pending',
  resident_category: 'damaged_signage',
  description: 'Synthetic faded sign',
  created_at: '2026-10-31T01:00:00+00:00',
  priority: { level: 'low', score: 2, reasons: [{ code: 'category', detail: 'damaged_signage', points: 1 }] },
}
const older = {
  id: 'bbbb2222-0000-0000-0000-000000000000',
  status: 'Pending',
  resident_category: 'exposed_wiring',
  description: 'Synthetic loose wire',
  created_at: '2026-10-20T01:00:00+00:00',
  hazards: ['electrical_hazard'],
  priority: {
    level: 'high',
    score: 7,
    reasons: [
      { code: 'category', detail: 'exposed_wiring', points: 3 },
      { code: 'hazard', detail: 'electrical_hazard', points: 2 },
      { code: 'residents', detail: 3, points: 2 },
    ],
  },
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

it('keeps newest first until staff choose to sort by the suggested priority, and explains it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return Response.json({ id: 's1', email: 'staff@example.test', role: 'staff' })
      if (url.endsWith(`/reports/${older.id}`)) return Response.json({ ...older, events: [], actions: [] })
      if (url.endsWith('/reports')) return Response.json([newer, older])
      if (url.endsWith('/duplicates')) return Response.json({ embedding_available: false, suggestions: [] })
      return Response.json([])
    }),
  )
  window.history.replaceState(null, '', '/desk/reports')
  render(<App />)
  const order = async () =>
    (await screen.findAllByRole('link', { name: /Review report/ })).map(link => link.getAttribute('href'))
  expect((await order())[0]).toContain(newer.id)
  // Low priority stays quiet in the list; high is marked.
  expect(screen.getAllByText('High priority')).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('Sort reports'))
  fireEvent.click(screen.getByRole('option', { name: 'Suggested priority' }))
  expect((await order())[0]).toContain(older.id)
  fireEvent.click(screen.getAllByRole('link', { name: /Review report/ })[0])
  const panel = await screen.findByRole('region', { name: 'Suggested priority' })
  expect(within(panel).getByText('3 residents reported it')).toBeInTheDocument()
  expect(within(panel).getByText('+3')).toBeInTheDocument()
  expect(within(panel).getByText(/Staff decide the order/)).toBeInTheDocument()
})
