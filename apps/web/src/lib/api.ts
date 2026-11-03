export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
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
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers })
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    const detail = typeof problem?.detail === 'string' ? problem.detail : `Request failed (${response.status})`
    throw new ApiError(detail, response.status)
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}

export const post = <T>(path: string, body?: unknown, init: RequestInit = {}) =>
  api<T>(path, {
    ...init,
    method: 'POST',
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  })
