import { noteReachable, noteUnreachable } from './live'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** What the API sent as `detail`, when it is more than a sentence (see cases.py's confirm_far). */
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

/** Both go through useText, so both have a Filipino entry in i18n.tsx. */
export const CANT_REACH = "Can't reach your barangay's server. Try again."
export const CANT_REACH_REPORT = "Can't reach your barangay's server. Your report is still here. Try again."

/** Nothing answered, or something that isn't BarangAI did (a Wi-Fi sign-in page). Not an ApiError: it is worth retrying. */
export class NetworkError extends Error {
  constructor() {
    super(CANT_REACH)
  }
}

/** What a report screen shows when a write fails: the same as anywhere else, plus that nothing was lost. */
export function reportErrorMessage(caught: unknown) {
  if (caught instanceof NetworkError) return CANT_REACH_REPORT
  return caught instanceof Error ? caught.message : 'Request failed'
}

/** A laptop that left the network gives no error for a long while, so every request gives up by itself. */
export const READ_TIMEOUT_MS = 20_000
export const WRITE_TIMEOUT_MS = 60_000
/** A 5 MB photo on weak Wi-Fi, then the server's blur and AI. */
export const UPLOAD_TIMEOUT_MS = 180_000

function timeoutFor(init: RequestInit) {
  if (init.body instanceof FormData) return UPLOAD_TIMEOUT_MS
  return init.method && init.method !== 'GET' ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS
}

export function csrfToken() {
  const cookie = document.cookie.split('; ').find(part => part.startsWith('csrf_token='))
  return cookie ? decodeURIComponent(cookie.slice(11)) : ''
}

/** Same-origin call to the FastAPI app; mutating requests carry the CSRF token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.method && init.method !== 'GET' && csrfToken()) headers.set('X-CSRF-Token', csrfToken())
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const cancelled = init.signal
  const cancel = () => controller.abort()
  if (cancelled?.aborted) cancel()
  cancelled?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, timeoutFor(init))
  try {
    const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers, signal: controller.signal })
    if (!response.ok) {
      const problem = await response.json().catch(() => null)
      const detail = problem?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : typeof detail?.message === 'string'
            ? detail.message
            : `Request failed (${response.status})`
      noteReachable()
      throw new ApiError(message, response.status, detail)
    }
    const body = response.status === 204 ? (undefined as T) : ((await response.json()) as T)
    noteReachable()
    return body
  } catch (caught) {
    if (caught instanceof ApiError || cancelled?.aborted) throw caught
    noteUnreachable()
    throw new NetworkError()
  } finally {
    clearTimeout(timer)
    cancelled?.removeEventListener('abort', cancel)
  }
}

export const post = <T>(path: string, body?: unknown, init: RequestInit = {}) =>
  api<T>(path, {
    ...init,
    method: 'POST',
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  })
