import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'

const exif = vi.hoisted(() => ({ gps: vi.fn() }))
vi.mock('exifr', () => ({ default: exif }))
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

const photo = () => new File(['test'], 'road.jpg', { type: 'image/jpeg' })
const next = () => fireEvent.click(screen.getByRole('button', { name: /^next/i }))

function serve(prediction: object, requests: Array<{ url: string; init?: RequestInit }> = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith('/auth/me')) return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
      if (url.endsWith('/reports/predict')) return Response.json(prediction)
      if (url.includes('/geo/reverse')) return Response.json({ label: 'Mabini Street, Zone 1' })
      if (url.endsWith('/reports') && init?.method === 'POST') return Response.json({ id: 'new', status: 'Pending' })
      return Response.json([])
    }),
  )
  return requests
}

const nothing = { prediction_available: false, model_category: null, confidence: null, hazards: [] }

beforeEach(() => window.history.replaceState(null, '', '/report'))
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  exif.gps.mockReset()
  localStorage.clear()
})

describe('location without typing', () => {
  it('takes the pin from the photo and shows its street name', async () => {
    exif.gps.mockResolvedValue({ latitude: 14.32941, longitude: 120.93672 })
    const requests = serve(nothing)
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(exif.gps).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    next()
    expect(await screen.findByText('From your photo', { exact: false })).toBeInTheDocument()
    expect((await screen.findAllByText(/Mabini Street, Zone 1/, {}, { timeout: 3000 })).length).toBeGreaterThan(0)
    expect(requests.some(request => request.url.includes('/geo/reverse?lat=14.32941&lng=120.93672'))).toBe(true)
    next()
    fireEvent.click(await screen.findByRole('radio', { name: 'Potholes' }))
    next()
    fireEvent.click(await screen.findByRole('checkbox', { name: /checked the auto-filled details/i }))
    fireEvent.click(await screen.findByRole('button', { name: /submit report/i }))
    await waitFor(() =>
      expect(requests.some(request => request.init?.method === 'POST' && request.url.endsWith('/reports'))).toBe(true),
    )
    const body = requests.find(request => request.init?.method === 'POST' && request.url.endsWith('/reports'))!.init!
      .body as FormData
    expect(body.get('latitude')).toBe('14.32941')
    expect(body.get('location_label')).toBeNull() // the server looks it up itself
    // What the browser read from the original photo, for the staff-only photo checks.
    expect(body.get('location_source')).toBe('photo')
    expect(body.get('photo_latitude')).toBe('14.32941')
    expect(requests.some(request => request.url.includes('/nearby?category=potholes'))).toBe(true)
  })

  it('falls back to the phone location when the photo has no GPS', async () => {
    exif.gps.mockResolvedValue(undefined)
    const getCurrentPosition = vi.fn(success => success({ coords: { latitude: 14.5, longitude: 121.01 } }))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    serve(nothing)
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled())
    next()
    expect(await screen.findByText('From your phone', { exact: false })).toBeInTheDocument()
  })

  it('stays quiet when the phone refuses location, and lets the resident set the pin', async () => {
    exif.gps.mockResolvedValue(undefined)
    const getCurrentPosition = vi.fn((_success, failure) => failure(new Error('denied')))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    serve(nothing)
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled()
  })
})

describe('AI suggestions', () => {
  it('sends the interface language and flags a category the two models disagree on', async () => {
    localStorage.setItem('barangai-language', 'fil')
    exif.gps.mockResolvedValue(undefined)
    const requests = serve({
      prediction_available: true,
      model_category: 'potholes',
      confidence: 0.4,
      category_source: 'vision',
      needs_check: true,
      suggested_description: 'May malalim na lubak sa kalsada.',
      hazards: ['blocks_road'],
    })
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/larawan ng insidente/i), { target: { files: [photo()] } })
    await waitFor(() => expect(requests.some(request => request.url.endsWith('/reports/predict'))).toBe(true))
    const form = requests.find(request => request.url.endsWith('/reports/predict'))!.init!.body as FormData
    expect(form.get('language')).toBe('fil')
    fireEvent.click(screen.getByRole('button', { name: /^susunod/i }))
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    fireEvent.click(screen.getByRole('button', { name: /^susunod/i }))
    expect(await screen.findByText('Hindi tiyak ang AI · pakisuri')).toBeInTheDocument()
    expect(screen.getByText('Nakaharang sa daan')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('May malalim na lubak sa kalsada.')
  })

  it('shows the electrical safety note when the photo shows an electrical hazard', async () => {
    exif.gps.mockResolvedValue(undefined)
    serve({
      prediction_available: true,
      model_category: 'fallen_trees',
      confidence: 0.8,
      category_source: 'agreed',
      needs_check: false,
      suggested_description: 'A tree fell onto power lines.',
      hazards: ['electrical_hazard'],
    })
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    expect(await screen.findByText(/AI suggests Fallen trees/i)).toBeInTheDocument()
    next()
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    next()
    expect(await screen.findByRole('note')).toHaveTextContent(/do not touch the wire/i)
    expect(screen.getByRole('radio', { name: 'Fallen trees' })).toBeChecked()
  })
})

describe('uncertain suggestions', () => {
  it('keeps the closest category, asks to verify, and explains streetlights', async () => {
    exif.gps.mockResolvedValue(undefined)
    serve({
      prediction_available: true,
      model_category: 'broken_streetlights',
      confidence: 0.4,
      category_source: 'vision',
      needs_check: true,
      problem_seen: false,
      suggested_description: 'The AI is uncertain whether this photo shows a problem. Please check. A lamp post.',
      hazards: [],
    })
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    expect(await screen.findByText('AI is uncertain')).toBeInTheDocument()
    next()
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    next()
    expect(await screen.findByRole('radio', { name: 'Broken streetlights' })).toBeChecked()
    expect(screen.getAllByText('AI unsure · please check')).toHaveLength(2)
    expect(screen.getByText(/cannot show whether a light works/)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue(
      'The AI is uncertain whether this photo shows a problem. Please check. A lamp post.',
    )
  })
})

describe('confirming auto-filled details', () => {
  it('blocks sending until the resident confirms, and asks again after going back', async () => {
    exif.gps.mockResolvedValue(undefined)
    serve({
      prediction_available: true,
      model_category: 'flooding',
      confidence: 0.88,
      needs_check: false,
      problem_seen: true,
      suggested_description: 'Water covers the road.',
      hazards: [],
    })
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    expect(await screen.findByText(/AI suggests Flooding/i)).toBeInTheDocument()
    next()
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    next()
    next()
    expect(await screen.findByText(/Auto-fill only helps you fill in this form/)).toBeInTheDocument()
    expect(screen.getAllByText('Auto-filled · check')).toHaveLength(2) // category and description, not the typed pin
    const submit = screen.getByRole('button', { name: /submit report/i })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /checked the auto-filled details/i }))
    expect(submit).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Water covers the road. Knee-deep.' } })
    next()
    expect(await screen.findByRole('checkbox', { name: /checked the auto-filled details/i })).not.toBeChecked()
  })

  it('clears the tick when the AI answer arrives after the resident confirmed', async () => {
    exif.gps.mockResolvedValue(undefined)
    let answer: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me'))
          return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
        if (url.endsWith('/reports/predict')) return new Promise<Response>(resolve => (answer = resolve))
        if (url.includes('/geo/reverse')) return Response.json({ label: 'Mabini Street, Zone 1' })
        return Response.json([])
      }),
    )
    const getCurrentPosition = vi.fn(success => success({ coords: { latitude: 14.5, longitude: 121.01 } }))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled())
    next()
    next()
    fireEvent.click(await screen.findByRole('radio', { name: 'Potholes' }))
    next()
    const box = await screen.findByRole('checkbox', { name: /checked the auto-filled details/i })
    fireEvent.click(box)
    expect(box).toBeChecked()
    answer(
      Response.json({
        prediction_available: true,
        model_category: 'flooding',
        confidence: 0.8,
        needs_check: false,
        problem_seen: true,
        suggested_description: 'Water covers the road.',
        hazards: [],
      }),
    )
    await waitFor(() => expect(box).not.toBeChecked())
    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled()
  })

  it('keeps a hand-set pin when the quiet phone location arrives late', async () => {
    exif.gps.mockResolvedValue(undefined)
    let fix: (position: object) => void = () => {}
    const getCurrentPosition = vi.fn(success => (fix = success))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    serve(nothing)
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled())
    next()
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    fix({ coords: { latitude: 14.5, longitude: 121.01 } })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(14.3)
    expect(screen.queryByText('From your phone', { exact: false })).toBeNull()
  })

  it("keeps the newer photo's GPS when the phone location for an earlier photo arrives late", async () => {
    exif.gps.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ latitude: 14.32941, longitude: 120.93672 })
    let fix: (position: object) => void = () => {}
    const getCurrentPosition = vi.fn(success => (fix = success))
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    serve(nothing)
    render(<App />)
    const picker = await screen.findByLabelText(/incident photo/i)
    fireEvent.change(picker, { target: { files: [photo()] } })
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    next()
    expect(await screen.findByText('From your photo', { exact: false })).toBeInTheDocument()
    fix({ coords: { latitude: 14.5, longitude: 121.01 } })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(14.32941)
    expect(screen.queryByText('From your phone', { exact: false })).toBeNull()
  })

  it('uses the phone location again once a photo has replaced the hand-set pin', async () => {
    exif.gps
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ latitude: 14.32941, longitude: 120.93672 })
      .mockResolvedValueOnce(undefined)
    // The phone refuses the first time, so the resident sets the pin by hand.
    const getCurrentPosition = vi.fn((success, failure) =>
      getCurrentPosition.mock.calls.length === 1
        ? failure()
        : success({ coords: { latitude: 14.5, longitude: 121.01 } }),
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    serve(nothing)
    render(<App />)
    const pick = async () => {
      fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
      await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    }
    await pick()
    next()
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await pick() // has GPS: the pin now comes from this photo
    await pick() // has none: the phone location fills the pin again
    next()
    expect(await screen.findByText('From your phone', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(14.5)
  })
})

describe('choices made while the photo is checked', () => {
  it('keeps the resident category and does not label it as the AI suggestion', async () => {
    exif.gps.mockResolvedValue({ latitude: 14.32941, longitude: 120.93672 })
    let answer: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/auth/me'))
          return Response.json({ id: 'r1', email: 'resident@example.test', role: 'resident' })
        if (url.endsWith('/reports/predict')) return new Promise<Response>(resolve => (answer = resolve))
        return Response.json([])
      }),
    )
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    await waitFor(() => expect(exif.gps).toHaveBeenCalled())
    next()
    await screen.findByText('From your photo', { exact: false })
    next()
    fireEvent.click(await screen.findByRole('radio', { name: 'Potholes' }))
    answer(
      Response.json({
        prediction_available: true,
        model_category: 'flooding',
        confidence: 0.8,
        needs_check: false,
        problem_seen: true,
        hazards: [],
      }),
    )
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getByRole('radio', { name: 'Potholes' })).toBeChecked()
    expect(screen.queryByText(/Filled by AI|AI unsure/)).toBeNull()
  })
})

describe('help me describe it', () => {
  it('adds, swaps and removes answers without touching what the resident typed', async () => {
    exif.gps.mockResolvedValue(undefined)
    serve(nothing)
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/incident photo/i), { target: { files: [photo()] } })
    // The photo is shrunk in the background before it counts as chosen.
    await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeEnabled())
    next()
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    next()
    expect(screen.queryByText('Help me describe it')).toBeNull() // no questions before a category
    fireEvent.click(await screen.findByRole('radio', { name: 'Flooding' }))
    const description = screen.getByRole('textbox')
    fireEvent.change(description, { target: { value: 'Near the chapel.' } })
    const depth = within(screen.getByRole('group', { name: 'How deep?' }))
    fireEvent.click(depth.getByRole('button', { name: /ankle-deep/i }))
    expect(description).toHaveValue('Near the chapel. The water is ankle-deep.')
    fireEvent.click(depth.getByRole('button', { name: /knee-deep/i }))
    expect(description).toHaveValue('Near the chapel. The water is knee-deep.')
    expect(depth.getByRole('button', { name: /knee-deep/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(depth.getByRole('button', { name: /knee-deep/i }))
    expect(description).toHaveValue('Near the chapel.')
  })

  it('adds the answer in Filipino when the app is in Filipino', async () => {
    localStorage.setItem('barangai-language', 'fil')
    exif.gps.mockResolvedValue(undefined)
    serve(nothing)
    render(<App />)
    fireEvent.change(await screen.findByLabelText(/larawan ng insidente/i), { target: { files: [photo()] } })
    // The photo is shrunk in the background before it counts as chosen.
    await waitFor(() => expect(screen.getByRole('button', { name: /^susunod/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /^susunod/i }))
    fireEvent.change(await screen.findByLabelText(/latitude/i), { target: { value: '14.3' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '120.9' } })
    fireEvent.click(screen.getByRole('button', { name: /^susunod/i }))
    fireEvent.click(await screen.findByRole('radio', { name: /baha/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Hanggang tuhod ang tubig' }))
    expect(screen.getByRole('textbox')).toHaveValue('Hanggang tuhod ang tubig.')
  })
})
