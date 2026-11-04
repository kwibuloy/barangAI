import { ApiError } from '../../lib/api'
import { label } from '../reports/categories'
import type { Category, Nearby, Prediction, Report } from '../reports/types'
import type { GlassesButton, GlassesScreen } from './connection'

/** Everything the flow needs from the app, passed in so tests can stand in for the glasses and the API. */
export type FlowDeps = {
  t: (text: string) => string
  show: (screen: GlassesScreen) => void
  takePhoto: () => Promise<File>
  position: () => Promise<[number, number] | null>
  predict: (photo: File) => Promise<Prediction>
  place: (lat: number, lng: number) => Promise<{ active: boolean; barangay: string | null } | null>
  street: (lat: number, lng: number) => Promise<string | null>
  nearby: (category: Category, lat: number, lng: number) => Promise<Nearby | null>
  submit: (form: FormData) => Promise<Report>
  /** Opens the report form on the phone with this photo, for anything the glasses can't settle. */
  finishOnPhone: (photo: File) => void
}

type Draft = { photo: File; category: Category; lat: number; lng: number }
type Step = 'ready' | 'busy' | 'confirm' | 'done'

/** A slow AI or GPS answer must not leave the glasses stuck on "Checking"; null moves the photo to the phone. */
const WAIT_MS = 30_000
const within = <T>(promise: Promise<T>) =>
  Promise.race([promise.catch(() => null), new Promise<null>(resolve => setTimeout(() => resolve(null), WAIT_MS))])

/** AI and GPS values are sent from the glasses only after this screen: pressing send is the resident's tick. */
export function confirmScreen(
  t: FlowDeps['t'],
  prediction: Prediction,
  where: { street: string | null; barangay: string | null; covered: boolean },
): GlassesScreen {
  const unsure = Boolean(prediction.needs_check) || prediction.problem_seen === false
  const category = t(label(prediction.model_category))
  const place = [where.street, where.barangay].filter(Boolean).join(', ') || t('Location from your phone')
  return {
    tone: unsure || !where.covered ? 'warning' : 'info',
    title: unsure ? `${category} · ${t('AI unsure · please check')}` : category,
    body: [
      place,
      where.covered ? '' : t('Outside the area we cover. An administrator will review it.'),
      t('AI can be wrong. Send only if the category and place are right.'),
    ]
      .filter(Boolean)
      .join('\n'),
    hint: t('Press: send · Hold: cancel'),
  }
}

/**
 * The hands-free report: press to take a photo, Kap fills the category and the phone's GPS the pin, the resident
 * checks them on the glasses and presses again to send. Anything the glasses can't settle (no category, no GPS,
 * a nearby report) moves to the phone's report form with the same photo.
 */
export function createGlassesFlow(deps: FlowDeps) {
  const { t, show } = deps
  let step: Step = 'ready'
  let draft: Draft | null = null
  // Each capture's number; a capture that was cancelled or overtaken drops its results instead of showing them.
  let run = 0

  const ready = () => {
    run++
    step = 'ready'
    draft = null
    show({
      title: t('Kap is ready'),
      body: t('See a problem? Look at it and press the button.'),
      hint: t('Press: take photo'),
    })
  }
  const toPhone = (photo: File, reason: string) => {
    step = 'done'
    draft = null
    show({ tone: 'warning', title: t('Finish on your phone'), body: t(reason), hint: t('Press: back') })
    deps.finishOnPhone(photo)
  }

  async function capture() {
    const mine = ++run
    const stale = () => mine !== run
    step = 'busy'
    show({ title: t('Taking photo…'), body: t('Hold still.'), hint: '' })
    let photo: File
    try {
      photo = await deps.takePhoto()
    } catch {
      if (stale()) return
      step = 'done'
      show({ tone: 'warning', title: t("Couldn't take the photo"), body: '', hint: t('Press: try again') })
      return
    }
    if (stale()) return
    show({
      title: t('Checking the photo…'),
      body: t('Kap is reading it and finding where you are.'),
      hint: t('Hold: cancel'),
    })
    const [prediction, position] = await Promise.all([within(deps.predict(photo)), within(deps.position())])
    if (stale()) return
    if (!prediction?.model_category) return toPhone(photo, "Kap couldn't tell what this is.")
    if (!position) return toPhone(photo, "Couldn't find your location.")
    const [lat, lng] = position
    const [found, place, street] = await Promise.all([
      within(deps.nearby(prediction.model_category, lat, lng)),
      within(deps.place(lat, lng)),
      within(deps.street(lat, lng)),
    ])
    if (stale()) return
    // The form offers adding to the resident's own report or a neighbours' case; that choice belongs on the phone.
    if ((found?.own?.length ?? 0) > 0 || (found?.cases?.length ?? 0) > 0) {
      return toPhone(photo, 'This may already be reported nearby.')
    }
    draft = { photo, category: prediction.model_category, lat, lng }
    step = 'confirm'
    show(confirmScreen(t, prediction, { street, barangay: place?.barangay ?? null, covered: place?.active !== false }))
  }

  async function send(current: Draft) {
    step = 'busy'
    show({ title: t('Sending…'), body: '', hint: '' })
    const form = new FormData()
    form.set('image', current.photo)
    form.set('resident_category', current.category)
    form.set('latitude', String(current.lat))
    form.set('longitude', String(current.lng))
    form.set('location_source', 'device')
    // The AI's description is never sent from here: the glasses can't show it for the resident to check.
    try {
      await deps.submit(form)
      step = 'done'
      draft = null
      show({
        title: t('Sent! Thank you'),
        body: t('Staff will check it. Follow it in My reports.'),
        hint: t('Press: report another'),
      })
    } catch (caught) {
      // Refused by the server (limits, a bad pin): finish on the phone. Otherwise it may have been saved after
      // all, so point to My reports instead of inviting a second copy.
      if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500)
        return toPhone(current.photo, caught.message)
      step = 'done'
      draft = null
      show({
        tone: 'warning',
        title: t("Couldn't send"),
        body: t('Check My reports on your phone before trying again.'),
        hint: t('Press: back'),
      })
    }
  }

  return {
    ready,
    press(button: GlassesButton) {
      if (step === 'busy') {
        // Cancel a slow check; sending can't be taken back once it has started.
        if (button === 'long_press' && !draft) ready()
        return
      }
      if (step === 'confirm' && draft) {
        if (button === 'click') void send(draft)
        else if (button === 'long_press' || button === 'swipe_back' || button === 'double_click') ready()
        return
      }
      if (step === 'done') {
        ready()
        return
      }
      if (button === 'click') void capture()
    },
  }
}
