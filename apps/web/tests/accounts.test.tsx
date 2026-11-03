import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'

type Call = { url: string; init?: RequestInit }

function serve(routes: (url: string, init?: RequestInit) => Response | undefined) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return routes(url, init) ?? Response.json([])
  })
  return calls
}

const signedOut = (url: string) => {
  if (url.endsWith('/auth/me')) return Response.json({ detail: 'Authentication required' }, { status: 401 })
  if (url.endsWith('/auth/google/config')) return Response.json({ enabled: false })
  return undefined
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.pushState({}, '', '/')
})

describe('legal pages', () => {
  it('shows the terms without signing in, with the emergency warning', async () => {
    window.history.pushState({}, '', '/terms')
    serve((url, init) =>
      url.endsWith('/legal/operator')
        ? Response.json({ name: null, contact: null })
        : (signedOut(url) ?? (init && undefined)),
    )
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Terms and Conditions' })).toBeInTheDocument()
    expect(screen.getByText(/call 911/i)).toBeInTheDocument()
    expect(await screen.findByText(/have not been published yet/i)).toBeInTheDocument()
  })

  it('names the operator on the privacy notice once it is set', async () => {
    window.history.pushState({}, '', '/privacy')
    serve(url =>
      url.endsWith('/legal/operator')
        ? Response.json({ name: 'Synthetic Barangay', contact: 'privacy@example.test' })
        : signedOut(url),
    )
    render(<App />)
    expect(await screen.findByText('Synthetic Barangay · privacy@example.test')).toBeInTheDocument()
  })
})

describe('registration', () => {
  it('sends the agreement with the new account', async () => {
    const calls = serve(url =>
      url.endsWith('/auth/register')
        ? Response.json({ id: 'u1', email: 'new@example.test', role: 'resident' })
        : signedOut(url),
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /new here/i }))
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'a synthetic password' } })
    const box = screen.getByRole('checkbox')
    expect(box).toBeRequired()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(calls.some(call => call.url.endsWith('/auth/register'))).toBe(true))
    const sent = calls.find(call => call.url.endsWith('/auth/register'))
    expect(JSON.parse(String(sent?.init?.body)).accepted_terms).toBe(true)
  })
})
