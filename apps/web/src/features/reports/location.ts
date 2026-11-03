import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

/** Where the pin came from, shown beside it so the resident knows what to double-check. */
export type LocationSource = 'photo' | 'device' | 'manual' | null

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
  onFailure: () => void,
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
