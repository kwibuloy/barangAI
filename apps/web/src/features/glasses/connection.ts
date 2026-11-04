import { useSyncExternalStore } from 'react'
import type { PluginListenerHandle } from '@capacitor/core'

/** What the BarangAI glasses app draws: a title, a body and a hint for the buttons. Warning turns the title amber. */
export type GlassesScreen = { tone?: 'info' | 'warning'; title: string; body: string; hint: string }
export type GlassesButton = 'click' | 'double_click' | 'long_press' | 'swipe_forward' | 'swipe_back'
type SessionState = 'idle' | 'starting' | 'started' | 'paused' | 'terminating'

/** RokidGlassesPlugin in apps/mobile (Rokid CXR-L SDK, through the Rokid AI App). */
export interface RokidGlassesPlugin {
  status(): Promise<{
    rokidApp: 'ok' | 'old' | 'missing'
    authorized: boolean
    glassesConnected: boolean
    state: SessionState
  }>
  authorize(): Promise<{ authorized: boolean; error?: string }>
  connect(): Promise<{ state: SessionState }>
  disconnect(options?: { forget?: boolean }): Promise<void>
  show(screen: GlassesScreen): Promise<void>
  takePhoto(): Promise<{ data: string; mime: string }>
  addListener(
    event: 'state',
    listener: (event: { state: SessionState; reason?: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(event: 'button', listener: (event: { action: GlassesButton }) => void): Promise<PluginListenerHandle>
  addListener(event: 'app', listener: (event: { state: 'ready' | 'paused' }) => void): Promise<PluginListenerHandle>
}

type CapacitorGlobal = { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean }

/** Only the Android app carries the plugin; the website and the staff dashboard never load the rest. */
export function glassesAvailable() {
  const capacitor = (window as { Capacitor?: CapacitorGlobal }).Capacitor
  return Boolean(capacitor?.isNativePlatform?.() && capacitor.isPluginAvailable?.('RokidGlasses'))
}

// A Capacitor plugin object answers every property, `then` included, so a promise resolved with it never settles
// (seen on the S23+, 4 Nov 2026: Connect glasses did nothing). It travels wrapped in a plain object instead.
let plugin: Promise<{ glasses: RokidGlassesPlugin }> | null = null
export const rokid = () =>
  (plugin ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    glasses: registerPlugin<RokidGlassesPlugin>('RokidGlasses'),
  })))

/**
 * Connection state shared by the settings card and the report flow. "Wanted" survives restarts on this phone,
 * so the glasses reconnect when the app opens until the resident disconnects them.
 */
export type GlassesConnection = {
  phase: 'off' | 'connecting' | 'on' | 'paused'
  problem: string | null
}
const WANTED = 'barangai-glasses'
let connection: GlassesConnection = { phase: 'off', problem: null }
const listeners = new Set<() => void>()

export function setConnection(next: Partial<GlassesConnection>) {
  connection = { ...connection, ...next }
  listeners.forEach(listener => listener())
}
export const useGlassesConnection = () =>
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => connection,
  )

export function glassesWanted() {
  try {
    return localStorage.getItem(WANTED) === 'on'
  } catch {
    return false
  }
}
function setWanted(wanted: boolean) {
  try {
    if (wanted) localStorage.setItem(WANTED, 'on')
    else localStorage.removeItem(WANTED)
  } catch {
    // Private storage off: the resident connects again next time.
  }
}

/** Asks for consent in the Rokid AI App when needed, then starts the session (the glasses app opens on its own). */
export async function connectGlasses() {
  const { glasses } = await rokid()
  setConnection({ phase: 'connecting', problem: null })
  try {
    const status = await glasses.status()
    if (status.rokidApp !== 'ok') {
      setConnection({
        phase: 'off',
        problem:
          status.rokidApp === 'old'
            ? 'Update the Rokid AI App first.'
            : 'Install the Rokid AI App and pair your glasses first.',
      })
      return
    }
    if (!status.authorized) {
      const consent = await glasses.authorize()
      if (!consent.authorized) {
        setConnection({ phase: 'off', problem: "Permission wasn't given in the Rokid AI App." })
        return
      }
    }
    setWanted(true)
    await glasses.connect()
  } catch {
    setConnection({ phase: 'off', problem: "Couldn't connect to the glasses. Check they're on and paired." })
  }
}

export async function disconnectGlasses() {
  setWanted(false)
  setConnection({ phase: 'off', problem: null })
  await (await rokid()).glasses.disconnect().catch(() => {})
}

/** The SDK's session states, as the settings card shows them. */
export function connectionFor(state: SessionState, reason?: string): Partial<GlassesConnection> {
  if (state === 'started') return { phase: 'on', problem: null }
  if (state === 'paused') return { phase: 'paused', problem: null }
  if (state === 'starting') return { phase: 'connecting', problem: null }
  // Closed by the resident from the glasses or the phone is no problem; a failed connect is.
  const failed = reason && !['USER_CLOSED', 'GLASSES_EXIT'].includes(reason)
  return {
    phase: 'off',
    problem: failed ? "Couldn't connect to the glasses. Check they're on and paired." : connection.problem,
  }
}

/** On sign-out: close the glasses, forget the Rokid consent and drop any photo waiting for the form. */
export function endGlassesSession() {
  handoff = null
  if (!glassesAvailable()) return
  setWanted(false)
  setConnection({ phase: 'off', problem: null })
  void rokid()
    .then(({ glasses }) => glasses.disconnect({ forget: true }))
    .catch(() => {})
}

/** A photo handed from the glasses to the report form, when the resident has to finish there. */
let handoff: File | null = null
export function handOffPhoto(file: File) {
  handoff = file
}
export function takeHandedOffPhoto() {
  const file = handoff
  handoff = null
  return file
}
