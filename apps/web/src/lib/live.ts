import { useSyncExternalStore } from 'react'
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

/**
 * Whether the server still answers, from every request the app makes. About three failed checks, and at least this
 * long since the first, so one burst of requests failing together on a Wi-Fi blip doesn't count as being offline.
 */
export const OFFLINE_AFTER_FAILURES = 3
export const OFFLINE_AFTER_MS = 10_000

let failures = 0
let firstFailureAt = 0
let lastAnswerAt: number | null = null
let offline = false
const listeners = new Set<() => void>()

function setOffline(value: boolean) {
  if (value === offline) return
  offline = value
  listeners.forEach(listener => listener())
}

export function noteReachable() {
  failures = 0
  lastAnswerAt = Date.now()
  setOffline(false)
}

export function noteUnreachable() {
  const at = Date.now()
  if (failures === 0) firstFailureAt = at
  failures += 1
  if (failures >= OFFLINE_AFTER_FAILURES && at - firstFailureAt >= OFFLINE_AFTER_MS) setOffline(true)
}

export function resetConnection() {
  failures = 0
  firstFailureAt = 0
  lastAnswerAt = null
  offline = false
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Null while the server answers; otherwise when it last did (0 if it never has since the app opened). */
export function useOfflineSince() {
  return useSyncExternalStore(subscribe, () => (offline ? (lastAnswerAt ?? 0) : null))
}
