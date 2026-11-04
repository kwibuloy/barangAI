import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Glasses as GlassesIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, post } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { devicePosition } from '../reports/location'
import { compressPhoto } from '../reports/photo'
import { findNearby, reportKeys } from '../reports/queries'
import type { Prediction, Report } from '../reports/types'
import { createGlassesFlow } from './flow'
import {
  connectGlasses,
  connectionFor,
  disconnectGlasses,
  glassesWanted,
  handOffPhoto,
  rokid,
  setConnection,
  useGlassesConnection,
} from './connection'

function photoFile(data: string, mime: string) {
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
  return new File([bytes], mime === 'image/webp' ? 'glasses.webp' : 'glasses.jpg', {
    type: mime,
    lastModified: Date.now(),
  })
}

/**
 * Runs the glasses while the resident app is open: reconnects them if the resident connected before, and turns
 * their button presses into a report. Draws nothing on the phone.
 */
export function GlassesLink() {
  const t = useText()
  const { language } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // The latest translations and navigation, without restarting the session when they change.
  const live = useRef({ t, language, navigate })
  live.current = { t, language, navigate }

  useEffect(() => {
    let stopped = false
    const handles: { remove: () => Promise<void> }[] = []
    void rokid().then(async ({ glasses }) => {
      const flow = createGlassesFlow({
        t: text => live.current.t(text),
        show: screen => void glasses.show(screen).catch(() => {}),
        takePhoto: async () => {
          const { data, mime } = await glasses.takePhoto()
          // Shrunk and re-encoded as JPEG like a picked photo; the server strips metadata again.
          return compressPhoto(photoFile(data, mime))
        },
        position: () =>
          new Promise(resolve =>
            devicePosition(
              position =>
                resolve([Number(position.coords.latitude.toFixed(6)), Number(position.coords.longitude.toFixed(6))]),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
            ),
          ),
        predict: photo => {
          const form = new FormData()
          form.set('image', photo)
          form.set('language', live.current.language)
          return post<Prediction>('/reports/predict', form)
        },
        place: (lat, lng) => api(`/barangays/locate?lat=${lat}&lng=${lng}`),
        street: (lat, lng) =>
          api<{ label: string | null }>(`/geo/reverse?lat=${lat}&lng=${lng}`).then(result => result.label),
        nearby: (category, lat, lng) => findNearby(category, String(lat), String(lng)),
        submit: async form => {
          const report = await post<Report>('/reports', form)
          void queryClient.invalidateQueries({ queryKey: reportKeys.all })
          return report
        },
        finishOnPhone: photo => {
          handOffPhoto(photo)
          live.current.navigate('/report?from=glasses')
        },
      })
      handles.push(
        await glasses.addListener('state', event => {
          setConnection(connectionFor(event.state, event.reason))
          if (event.state === 'started') flow.ready()
        }),
        // The glasses app came back to the front (it asks for its screen whenever it does).
        await glasses.addListener('app', event => event.state === 'ready' && flow.ready()),
        await glasses.addListener('button', event => flow.press(event.action)),
      )
      if (stopped) return handles.forEach(handle => void handle.remove())
      const status = await glasses.status().catch(() => null)
      if (status?.state === 'started') {
        setConnection({ phase: 'on', problem: null })
        flow.ready()
      } else if (glassesWanted() && status?.authorized) {
        void connectGlasses()
      }
    })
    return () => {
      stopped = true
      handles.forEach(handle => void handle.remove())
    }
  }, [queryClient])
  return null
}

const PHASE = {
  on: 'Connected. Press the glasses button to report.',
  paused: 'Paused while the glasses assistant is on.',
  connecting: 'Connecting…',
  off: 'Report hands-free: press the glasses button to take a photo, check what Kap found, and send.',
} as const

/** Connect or disconnect Rokid Glasses, in the resident's account sheet (Android app only). */
export function GlassesSettings() {
  const { phase, problem } = useGlassesConnection()
  const connected = phase === 'on' || phase === 'paused'
  return (
    <section className="space-y-2" aria-labelledby="glasses-heading">
      <h3 id="glasses-heading" className="px-1 text-[13px] font-medium text-muted-foreground">
        <Txt>Rokid Glasses</Txt>
      </h3>
      <div className="space-y-3 rounded-2xl border-2 border-b-4 p-4">
        <p className="flex items-start gap-2 text-[15px]">
          <GlassesIcon className="mt-0.5 size-5 shrink-0 text-secondary" aria-hidden="true" />
          <span aria-live="polite">
            <Txt>{PHASE[phase]}</Txt>
          </span>
        </p>
        {problem && (
          <p role="alert" className="text-[14px] text-destructive">
            <Txt>{problem}</Txt>
          </p>
        )}
        {connected ? (
          <Button variant="outline" size="lg" className="w-full" onClick={() => void disconnectGlasses()}>
            <Txt>Disconnect</Txt>
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={phase === 'connecting'} onClick={() => void connectGlasses()}>
            {phase === 'connecting' && <Loader2 className="animate-spin" aria-hidden="true" />}
            <Txt>Connect glasses</Txt>
          </Button>
        )}
        <p className="text-[13px] text-muted-foreground">
          <Txt>
            {'Photos go from the glasses to your phone through the Rokid AI App, then to BarangAI like any report.'}
          </Txt>
        </p>
      </div>
    </section>
  )
}
