import { ApiError } from './api'

/** How often updates are checked while the app is on screen. Query pauses this while the app is hidden. */
export const LIVE_NOTICES_MS = 5_000
/** Reports change for staff without a notice when a colleague moves them, so lists and details are checked too. */
export const LIVE_REPORTS_MS = 15_000

/**
 * The error a page should show. A background check that fails over data already on screen stays quiet and tries again,
 * so a Wi-Fi drop doesn't raise an alert; a client error such as a deleted report still shows.
 */
export function shownError(query: { error: Error | null; data: unknown }) {
  const { error, data } = query
  if (!error) return null
  return data === undefined || (error instanceof ApiError && error.status < 500) ? error : null
}

/** A refetch interval that stops on a client error, such as an expired session or a deleted report. */
export const every =
  (ms: number) =>
  (query: { state: { error: Error | null } }): number | false =>
    query.state.error instanceof ApiError && query.state.error.status < 500 ? false : ms
