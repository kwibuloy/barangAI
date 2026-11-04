import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'

const reward = {
  id: 'w1',
  barangay_id: 'b1',
  name: 'Barangay ID',
  description: null,
  partner: null,
  points_cost: 250,
  stock: null,
}
const voucher = {
  id: 'v1',
  code: 'ABCD2345',
  status: 'active',
  points_cost: 250,
  reward: 'Barangay ID',
  partner: null,
  barangay: 'San Jose',
  created_at: '2026-11-04T00:00:00Z',
  expires_at: '2026-12-04T00:00:00Z',
  used_at: null,
}

function serve(role: string, points: number, calls: Array<{ url: string; init?: RequestInit }> = []) {
  let redeemed = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/auth/me'))
        return Response.json({ id: 'u1', email: 'someone@example.test', role, barangay: 'San Jose' })
      if (url.endsWith('/points')) return Response.json({ balance: points, history: [] })
      if (url.endsWith('/rewards/barangays')) return Response.json([{ id: 'b1', name: 'San Jose' }])
      if (url.includes('/rewards?barangay_id=b1')) return Response.json([reward])
      if (url.endsWith('/rewards/w1/redeem')) {
        redeemed = true
        return Response.json(voucher, { status: 201 })
      }
      if (url.endsWith('/vouchers')) return Response.json({ available: redeemed ? [voucher] : [], history: [] })
      if (url.endsWith('/vouchers/use')) return Response.json({ ...voucher, status: 'used' })
      if (url.endsWith('/rewards/manage')) return Response.json([{ ...reward, active: true }])
      return Response.json([])
    }),
  )
  return calls
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('rewards', () => {
  it('lets a resident pick a barangay, confirm a reward and see the code', async () => {
    serve('resident', 300)
    window.history.replaceState(null, '', '/rewards')
    render(<App />)
    expect(await screen.findByText('300')).toBeInTheDocument()
    fireEvent.click(await screen.findByLabelText('Choose a barangay'))
    fireEvent.click(await screen.findByRole('option', { name: 'San Jose' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Redeem' }))
    fireEvent.click(screen.getByRole('button', { name: 'Spend the points' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redeem' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: 'My codes' }))
    expect(await screen.findByText('ABCD2345')).toBeInTheDocument()
  })

  it('does not offer a reward the resident cannot afford', async () => {
    serve('resident', 10)
    window.history.replaceState(null, '', '/rewards')
    render(<App />)
    fireEvent.click(await screen.findByLabelText('Choose a barangay'))
    fireEvent.click(await screen.findByRole('option', { name: 'San Jose' }))
    expect(await screen.findByRole('button', { name: 'Not enough points' })).toBeDisabled()
  })

  it('lets staff mark a code as used and shows their shop', async () => {
    const calls = serve('staff', 0)
    window.history.replaceState(null, '', '/desk/rewards')
    render(<App />)
    expect(await screen.findByText('Barangay ID')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'abcd2345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as used' }))
    expect(await screen.findByText(/Marked as used/)).toBeInTheDocument()
    const sent = calls.find(call => call.url.endsWith('/vouchers/use'))
    expect(JSON.parse(String(sent?.init?.body)).code).toBe('abcd2345')
  })
})
