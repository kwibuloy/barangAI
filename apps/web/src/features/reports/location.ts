import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

/** Where the pin came from, shown beside it so the resident knows what to double-check. */
export type LocationSource = 'photo' | 'device' | 'manual' | 'previous' | null

/**
 * GPS coordinates from the photo's own metadata, read in the browser before upload (the server strips all
 * metadata before storing). Many photos carry none: iPhones drop it when picking in a browser, chat apps strip it.
 */
export async function photoCoordinates(file: File): Promise<[number, number] | null> {
  try {
    const { default: exifr } = await import('exifr')
    const gps = await exifr.gps(file)
    const lat = Number(gps?.latitude)
    const lng = Number(gps?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    if (lat === 0 && lng === 0) return null
    return [Number(lat.toFixed(6)), Number(lng.toFixed(6))]
  } catch {
    return null
  }
}

/**
 * The device's position. The Android app loads this site from a laptop over plain HTTP, where the browser
 * refuses GPS, so there it asks the native plugin.
 */
export function devicePosition(
  onPosition: (position: { coords: { latitude: number; longitude: number } }) => void,
  onFailure: (reason: unknown) => void,
  options: PositionOptions,
) {
  const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  if (!native) {
    navigator.geolocation.getCurrentPosition(onPosition, onFailure, options)
    return
  }
  void import('@capacitor/geolocation')
    .then(({ Geolocation }) => Geolocation.getCurrentPosition(options))
    .then(onPosition, onFailure)
}

/**
 * What to tell the resident when GPS fails. Browsers give a code (1 refused, 2 no position, 3 too slow); the Android
 * app's plugin gives codes such as OS-PLUG-GLOC-0003 and a message, so the wording decides there.
 */
export function locationProblem(reason: unknown) {
  const { code, message } = (reason ?? {}) as { code?: unknown; message?: unknown }
  const text = `${String(code ?? '')} ${String(message ?? '')}`
  if (code === 1 || /permission|denied|GLOC-000[39]/i.test(text))
    return 'Location permission is off for this app. Allow it in your phone settings, or set the pin on the map.'
  if (code === 2 || /not enabled|disabled|turned off|location services|GLOC-00(07|16|17)/i.test(text))
    return 'GPS is off on this phone. Turn on Location and try again, or set the pin on the map.'
  return "GPS couldn't find you. Try again in an open spot, or set the pin on the map."
}

/** Which barangay the pin falls in, as a preview; the server works it out again on submit. Null while unknown. */
export function useBarangayAt(latitude: string, longitude: string) {
  const [place, setPlace] = useState<{ active: boolean; barangay: string | null } | null>(null)
  useEffect(() => {
    setPlace(null)
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (latitude === '' || longitude === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void api<{ active: boolean; barangay: string | null }>(`/barangays/locate?lat=${lat}&lng=${lng}`, {
        signal: controller.signal,
      })
        .then(setPlace)
        .catch(() => {})
    }, 600)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [latitude, longitude])
  return place
}

/** Street name for the pin from the API's geocoder; null when unknown or the geocoder is off. */
export function useStreetName(latitude: string, longitude: string) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    setLabel(null)
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (latitude === '' || longitude === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    const controller = new AbortController()
    // Wait for the pin to settle (typing, dragging) before asking.
    const timer = setTimeout(() => {
      void api<{ label: string | null }>(`/geo/reverse?lat=${lat}&lng=${lng}`, { signal: controller.signal })
        .then(result => setLabel(result.label))
        .catch(() => {})
    }, 600)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [latitude, longitude])
  return label
}
