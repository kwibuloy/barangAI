import type { LocationSource } from './location'
import type { PhotoDetails } from './photo'
import type { Category, Hazard } from './types'

/**
 * An unsent report, kept on this device per account so a tab switch, a reload or a dropped session doesn't lose it.
 * The photo is the copy prepared for upload, normally redrawn without its metadata (compressPhoto keeps the original
 * when a browser can't redraw it); it shows blurred again when restored, until the server's blurred copy replaces it. Wiped on sign-out, after sending and after 24 hours. Storage can be missing or
 * refuse (private mode, a full disk): every call here then does nothing and the form works without drafts.
 */
export type ReportDraft = {
  photo: File | null
  category: Category | ''
  description: string
  latitude: string
  longitude: string
  locationSource: LocationSource
  details: PhotoDetails | null
  photoGps: [number, number] | null
  dismissedHazards: Hazard[]
  /** What the AI wrote, so a restored value still needs the resident's tick while it is unchanged. */
  aiCategory: string | null
  aiDescription: string | null
  /** The category a follow-up carried from the earlier report; it needs the same tick. */
  carriedCategory: Category | null
  caseId: string | null
  step: number
  savedAt: number
}

export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const DATABASE = 'barangai-drafts'
const STORE = 'report-drafts'

// Writes run in order, and signing out stops later ones: the form saves what it holds as it closes, which would
// otherwise land after the wipe. The marker is shared, because that form may be open in another tab.
let queue: Promise<unknown> = Promise.resolve()
const CLOSED = 'barangai-drafts-closed'
let closedHere = false

function setClosed(value: boolean) {
  closedHere = value
  try {
    if (value) localStorage.setItem(CLOSED, '1')
    else localStorage.removeItem(CLOSED)
  } catch {
    // Private mode: this tab's own flag still holds.
  }
}

function isClosed() {
  try {
    return closedHere || localStorage.getItem(CLOSED) === '1'
  } catch {
    return closedHere
  }
}

function inOrder<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => {})
  return next
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Draft storage is blocked'))
  })
}

/** One request in its own transaction; null when storage isn't there or refuses. */
async function run<T>(mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const database = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode)
        const request = ask(transaction.objectStore(STORE))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }
  } catch {
    return null
  }
}

export function saveDraft(accountId: string, draft: ReportDraft) {
  return inOrder(async () => {
    if (isClosed()) return
    await run('readwrite', store => store.put(draft, accountId))
  })
}

/** This account's draft, if it is still fresh. No other account's key is ever read. */
export function loadDraft(accountId: string, at = Date.now()) {
  return inOrder(async () => {
    const found = await run<ReportDraft | undefined>('readonly', store => store.get(accountId))
    if (!found) return null
    if (at - found.savedAt <= DRAFT_MAX_AGE_MS) return found
    await run('readwrite', store => store.delete(accountId))
    return null
  })
}

export function clearDraft(accountId: string) {
  return inOrder(async () => {
    await run('readwrite', store => store.delete(accountId))
  })
}

/** On sign-out and account deletion: this device keeps no one's unsent photo. */
export function clearAllDrafts() {
  setClosed(true)
  return inOrder(async () => {
    await run('readwrite', store => store.clear())
  })
}

/** When an account opens the app: a session that simply expired may have left someone else's draft behind. */
export function keepOnlyDraftsOf(accountId: string) {
  setClosed(false)
  return inOrder(async () => {
    const accounts = await run<IDBValidKey[]>('readonly', store => store.getAllKeys())
    for (const account of accounts ?? []) {
      if (account !== accountId) await run('readwrite', store => store.delete(account))
    }
  })
}

/** When the app opens, for anyone or no one signed in: 24 hours is promised even if that account never returns. */
export function removeExpiredDrafts(at = Date.now()) {
  return inOrder(async () => {
    const accounts = await run<IDBValidKey[]>('readonly', store => store.getAllKeys())
    for (const account of accounts ?? []) {
      const found = await run<ReportDraft | undefined>('readonly', store => store.get(account))
      if (found && at - found.savedAt > DRAFT_MAX_AGE_MS) await run('readwrite', store => store.delete(account))
    }
  })
}
