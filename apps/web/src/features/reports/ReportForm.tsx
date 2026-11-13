import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m } from 'motion/react'
import { ChevronLeft, ChevronRight, LoaderCircle, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kap, type KapPose } from '@/components/Kap'
import { Alert, LargeTitle } from '@/components/page'
import { cn } from '@/lib/utils'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'
import { post, reportErrorMessage } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { ResidentAccount, useResident } from '../../app/ResidentShell'
import { label } from './categories'
import {
  devicePosition,
  locationProblem,
  photoCoordinates,
  useBarangayAt,
  useStreetName,
  type LocationSource,
} from './location'
import { clearDraft, loadDraft, saveDraft, type ReportDraft } from './draft'
import { compressPhoto, MAX_PICK_BYTES, MAX_UPLOAD_BYTES, photoDetails, type PhotoDetails } from './photo'
import { findNearby, reportKeys, useCommunityCases, useSubmitReport } from './queries'
import type { Category, FollowUp, Hazard, Nearby, Prediction, Report } from './types'
import { takeHandedOffPhoto } from '../glasses/connection'
import { ContinueDraft } from './form/ContinueDraft'
import { DetailsStep } from './form/DetailsStep'
import { LocationStep } from './form/LocationStep'
import { NearbySheet } from './form/NearbySheet'
import { PhotoStep } from './form/PhotoStep'
import { ReviewStep } from './form/ReviewStep'
import { EASE, validCoordinates, type PreviewState } from './form/shared'
import { SuccessView } from './form/SuccessView'
import { Summary } from './form/Summary'

const UNAVAILABLE: Prediction = { prediction_available: false, model_category: null, confidence: null }
const NOT_FILLED = { category: false, description: false }
const NO_AI = { category: null, description: null }
const STEPS = ['Photo', 'Location', 'Details', 'Review'] as const
/** Kap coaches each step from beside the progress bar, like Duolingo's owl over a lesson. */
const COACH: { pose: KapPose; line: string }[] = [
  { pose: 'idea', line: 'Show me what needs fixing. One clear photo helps staff most.' },
  { pose: 'thinking', line: 'Where is it? Pin the exact spot so the team can find it.' },
  { pose: 'clipboard', line: 'Check what I filled in and change anything that looks wrong.' },
  { pose: 'thumbs', line: 'Looking good! One last check, then send it to your barangay.' },
]

type Blurred = { faces: number; plates: number }

/** Only what the detectors found, as a best effort: never a promise that everything private is gone. */
function useBlurLine(blurred: Blurred | null) {
  const t = useText()
  if (!blurred || blurred.faces + blurred.plates === 0) return ''
  const part = (count: number, one: string, many: string) => (count ? [`${count} ${t(count === 1 ? one : many)}`] : [])
  const parts = [...part(blurred.faces, 'face', 'faces'), ...part(blurred.plates, 'plate', 'plates')]
  return `${t('Kap blurred')} ${parts.join(` ${t('and')} `)}. ${t('Check that nothing else private shows.')}`
}

/** Client-side checks so residents learn about unusable photos before uploading them. */
function photoProblem(file: File) {
  if (/\.hei[cf]$/i.test(file.name) || ['image/heic', 'image/heif'].includes(file.type))
    return 'HEIC photos are not supported. Choose JPG, PNG, or WebP, or take a new photo.'
  const supported =
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name))
  if (!supported) return 'Choose a JPG, PNG, or WebP photo.'
  if (file.size > MAX_PICK_BYTES) return 'Photo is too large. Choose a photo of 25 MB or less.'
  return ''
}

export function ReportForm() {
  const desktop = useMediaQuery(DESKTOP)
  const t = useText()
  const submitReport = useSubmitReport()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  // The original stays heavily blurred on screen until the server's face-blurred copy replaces it.
  const [previewState, setPreviewState] = useState<PreviewState>('checking')
  const [blurred, setBlurred] = useState<Blurred | null>(null)
  const blurLine = useBlurLine(blurred)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [dismissedHazards, setDismissedHazards] = useState<Hazard[]>([])
  const [category, setCategory] = useState<Category | ''>('')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  // Why GPS gave no pin, kept for the Location step even when the attempt was the quiet one after a photo.
  const [gpsProblem, setGpsProblem] = useState('')
  const [submitted, setSubmitted] = useState<Report | null>(null)
  // Which fields the AI filled from the photo; editing a field hands it back to the resident.
  const [aiFilled, setAiFilled] = useState(NOT_FILLED)
  const [locationSource, setLocationSource] = useState<LocationSource>(null)
  // The latest photo pick; a slower shrink of an earlier pick must not replace it.
  const pickId = useRef(0)
  const [pickKey, setPickKey] = useState(0)
  const [preparing, setPreparing] = useState(false)
  // Whether the photo held is a redrawn copy. A browser that can't redraw hands back the original, metadata and all,
  // which may go to the server (it strips it there) but is never kept on the device in a draft.
  const [photoRedrawn, setPhotoRedrawn] = useState(false)
  // Read from the original photo before shrinking drops them; staff use them to check the pin and date.
  const [details, setDetails] = useState<PhotoDetails | null>(null)
  const [photoGps, setPhotoGps] = useState<[number, number] | null>(null)
  // "You already reported this": the resident's own open report or a neighbours' case near the pin.
  const [nearby, setNearby] = useState<Nearby | null>(null)
  const [checking, setChecking] = useState(false)
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { language } = useLanguage()
  const streetName = useStreetName(latitude, longitude)
  const place = useBarangayAt(latitude, longitude)
  // "I see this too" from the community map: this report is offered to staff as evidence for that case.
  const [params, setParams] = useSearchParams()
  const caseId = params.get('case')
  const community = useCommunityCases(Boolean(caseId))
  const joining = caseId ? community.data?.find(item => item.id === caseId && item.open_for_evidence) : undefined
  useEffect(() => {
    if (joining) setCategory(current => current || joining.category)
  }, [joining])
  // A field counts as the AI's only while it still holds the AI's text: a choice the resident made while the
  // photo was being checked is theirs, even though the AI's answer arrived afterwards.
  // A restored draft remembers what the AI wrote: the fresh answer may differ, fail or come after Submit.
  const [restoredAi, setRestoredAi] = useState<{ category: string | null; description: string | null }>(NO_AI)
  const aiCategory =
    (aiFilled.category && category === prediction?.model_category) ||
    (Boolean(category) && category === restoredAi.category)
  const aiDescription =
    (aiFilled.description && description === prediction?.suggested_description) ||
    (Boolean(description) && description === restoredAi.description)
  const autoLocation = locationSource === 'photo' || locationSource === 'device' || locationSource === 'previous'
  // The case's staff-verified category, offered to the resident; it becomes theirs only once they confirm it.
  const caseCategory = Boolean(joining) && category === joining?.category
  // The category a follow-up came with, possibly staff's: likewise the resident's only once confirmed. A new
  // photo's AI answer doesn't replace it.
  const carriedCategory = useRef<Category | null>(null)
  const carried = Boolean(category) && category === carriedCategory.current
  // Auto-fill only assists: whatever it filled must be confirmed by the resident before sending.
  const autoFilled = aiCategory || aiDescription || autoLocation || caseCategory || carried
  // The tick covers the exact values the resident saw for this photo, so a late GPS fix, AI answer or new
  // photo clears it.
  const shown = [pickKey, category, description, latitude, longitude, locationSource].join('|')
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null)
  const confirmed = confirmedFor === shown
  // A pin the resident set by hand wins over the quiet GPS lookup that may still be running.
  const pinnedByHand = useRef(false)
  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(photo)
    setPreview(url)
    setPreviewState('checking')
    setBlurred(null)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  useEffect(() => {
    if (!photo) return
    const controller = new AbortController()
    const form = new FormData()
    form.set('image', photo)
    form.set('language', language)
    const analyse = () =>
      post<Prediction>('/reports/predict', form, { signal: controller.signal })
        .then(result => {
          if (controller.signal.aborted) return
          setPrediction(result)
          const filled = { ...NOT_FILLED }
          if (result.model_category) {
            setCategory(current => current || result.model_category!)
            filled.category = true
          }
          if (result.suggested_description) {
            setDescription(current => current || result.suggested_description!)
            filled.description = true
          }
          setAiFilled(filled)
        })
        .catch(() => {
          if (!controller.signal.aborted) setPrediction(UNAVAILABLE)
        })
    // Faces first: it takes about a second, and the AI's answer then reuses the blurred copy.
    void post<{ preview_image: string; faces_blurred?: number; plates_blurred?: number }>(
      '/reports/photo-preview',
      form,
      { signal: controller.signal },
    )
      .then(result => {
        if (controller.signal.aborted) return
        setPreview(result.preview_image)
        setPreviewState('ready')
        setBlurred({ faces: result.faces_blurred ?? 0, plates: result.plates_blurred ?? 0 })
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewState('failed')
      })
      .then(() => {
        if (!controller.signal.aborted) void analyse()
      })
    return () => controller.abort()
    // Analyse each photo once, in the language in use when it was chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo])

  // Saved on this device per account, so another tab, a reload or a dropped session doesn't lose the report.
  const accountId = useResident().id
  const { state: arrival } = useLocation()
  const followUp = (arrival as { followUp?: FollowUp } | null)?.followUp
  const [offer, setOffer] = useState<ReportDraft | null>(null)
  // Nothing is saved until the saved draft has been looked at, or it would be replaced before it could be offered.
  const [draftChecked, setDraftChecked] = useState(false)
  const unsaved = useRef<ReportDraft | null>(null)
  function applyFollowUp() {
    if (!followUp) return
    carriedCategory.current = followUp.category
    setCategory(followUp.category)
    setDescription(`${t('Still not fixed. Follow-up to report')} #${followUp.reportId.slice(0, 8).toUpperCase()}.`)
    setLatitude(String(followUp.latitude))
    setLongitude(String(followUp.longitude))
    setLocationSource('previous')
    navigate('/report', { replace: true, state: null })
  }
  useEffect(() => {
    let alive = true
    void loadDraft(accountId).then(found => {
      if (!alive) return
      // Arriving to add to a case, finish a photo from the glasses or follow up a report ("Still not fixed"): that is
      // what the resident came to do, so the old draft isn't offered, and the new one replaces it.
      if (found && !caseId && !fromGlasses && !followUp) setOffer(found)
      else {
        applyFollowUp()
        setDraftChecked(true)
      }
    })
    return () => {
      alive = false
    }
    // Once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])
  function restoreDraft(draft: ReportDraft) {
    pickId.current += 1
    setPickKey(pickId.current)
    setPhoto(draft.photo)
    setPhotoRedrawn(Boolean(draft.photo && draft.photoRedrawn))
    setCategory(draft.category)
    setDescription(draft.description)
    setLatitude(draft.latitude)
    setLongitude(draft.longitude)
    setLocationSource(draft.locationSource)
    pinnedByHand.current = draft.locationSource === 'manual'
    setDetails(draft.details)
    setPhotoGps(draft.photoGps)
    setDismissedHazards(draft.dismissedHazards)
    setRestoredAi({ category: draft.aiCategory, description: draft.aiDescription })
    carriedCategory.current = draft.carriedCategory
    if (draft.caseId) setParams({ case: draft.caseId }, { replace: true })
    setStep(Math.min(draft.step, STEPS.length - 1))
    setOffer(null)
    setDraftChecked(true)
  }
  function discardDraft() {
    void clearDraft(accountId)
    setOffer(null)
    applyFollowUp()
    setDraftChecked(true)
  }
  // Whether this form has put a draft on the device, so emptying the form can take it away again.
  const savedHere = useRef(false)
  useEffect(() => {
    if (!draftChecked || submitted) return
    const keptPhoto = photoRedrawn ? photo : null
    const worthKeeping = keptPhoto || description.trim() || validCoordinates(latitude, longitude)
    unsaved.current = worthKeeping
      ? {
          photo: keptPhoto,
          photoRedrawn: Boolean(keptPhoto),
          category,
          description,
          latitude,
          longitude,
          locationSource,
          details,
          photoGps,
          dismissedHazards,
          aiCategory: aiCategory ? category : null,
          aiDescription: aiDescription ? description : null,
          carriedCategory: carriedCategory.current,
          caseId,
          // Without its photo the draft starts again at the Photo step.
          step: photo && !keptPhoto ? 0 : step,
          savedAt: Date.now(),
        }
      : null
    if (!unsaved.current) {
      if (savedHere.current) {
        savedHere.current = false
        void clearDraft(accountId)
      }
      return
    }
    const timer = setTimeout(() => {
      if (!unsaved.current) return
      savedHere.current = true
      void saveDraft(accountId, unsaved.current)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the values above
  }, [
    draftChecked,
    submitted,
    photo,
    photoRedrawn,
    category,
    description,
    latitude,
    longitude,
    locationSource,
    details,
    photoGps,
    dismissedHazards,
    caseId,
    step,
  ])
  // Leaving the tab can't wait for the timer above.
  useEffect(
    () => () => {
      if (unsaved.current) void saveDraft(accountId, unsaved.current)
    },
    [accountId],
  )
  function reportSent() {
    unsaved.current = null
    void clearDraft(accountId)
  }

  // Focus follows the step, for screen readers and keyboards: a heading, so a phone's keyboard stays closed.
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const openedAtStep = useRef(step)
  useEffect(() => {
    if (openedAtStep.current === step) return
    openedAtStep.current = -1
    stepHeading.current?.focus({ preventScroll: true })
  }, [step])

  // Faces first, then the AI's classification; the photo is revealed once both are done (or the AI is unavailable).
  const photoState: PreviewState = previewState === 'ready' && !prediction ? 'analysing' : previewState
  function go(next: number) {
    setDirection(next > step ? 1 : -1)
    setError('')
    setStep(next)
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })
  }
  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset native inputs so selecting the same photo again still fires change.
    event.target.value = ''
    if (file) pickPhoto(file)
  }
  // A photo from the Rokid Glasses that needs finishing here (no category, no GPS, or a report nearby).
  // Keyed on the link, so it also arrives when the form is already open.
  const fromGlasses = params.get('from') === 'glasses'
  useEffect(() => {
    if (!fromGlasses) return
    const handed = takeHandedOffPhoto()
    if (handed) pickPhoto(handed)
    setParams(
      current => {
        current.delete('from')
        return current
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per handoff
  }, [fromGlasses])
  function pickPhoto(file: File) {
    setPhoto(null)
    setPreview('')
    setBlurred(null)
    // "I see this too" keeps the case's category; otherwise the new photo's AI answer fills it.
    setCategory(joining?.category ?? carriedCategory.current ?? '')
    setRestoredAi(NO_AI)
    if (aiDescription) setDescription('')
    setAiFilled(NOT_FILLED)
    setPrediction(null)
    setError('')
    const problem = photoProblem(file)
    const pick = ++pickId.current
    setPickKey(pick)
    if (problem) {
      setPreparing(false)
      setError(problem)
      return
    }
    setPreparing(true)
    setDetails(null)
    setPhotoGps(null)
    void photoDetails(file).then(found => pick === pickId.current && setDetails(found))
    // Shrink before upload to save data and storage; GPS is read from the original below, before it is lost.
    void compressPhoto(file).then(small => {
      if (pick !== pickId.current) return
      setPreparing(false)
      if (small.size > MAX_UPLOAD_BYTES) {
        setError('This device could not shrink the photo. Choose a photo of 5 MB or less.')
        return
      }
      setPhotoRedrawn(small !== file)
      setPhoto(small)
    })
    // Location without typing: the photo's own GPS first, then the phone's, quietly (the pin can still move).
    void photoCoordinates(file).then(coordinates => {
      if (pick !== pickId.current) return
      setPhotoGps(coordinates)
      if (coordinates) {
        setLatitude(String(coordinates[0]))
        setLongitude(String(coordinates[1]))
        setLocationSource('photo')
        pinnedByHand.current = false
      } else if (locationSource === 'photo' || !validCoordinates(latitude, longitude)) {
        // The pin came from the previous photo, so it may be somewhere else entirely.
        if (locationSource === 'photo') {
          setLatitude('')
          setLongitude('')
          setLocationSource(null)
        }
        pinnedByHand.current = false
        locate(true, pick)
      }
    })
  }
  function placePin(lat: string, lng: string) {
    setLatitude(lat)
    setLongitude(lng)
    setLocationSource('manual')
    setGpsProblem('')
    pinnedByHand.current = true
  }
  /**
   * Quiet mode is the automatic attempt after a photo: a refusal shows no error, the resident just sets the pin.
   * Its answer is dropped once the resident has set the pin or picked another photo.
   */
  function locate(quiet = false, pick = pickId.current) {
    if (!navigator.geolocation) {
      setGpsProblem('GPS is unavailable. Enter coordinates or place a pin on the map.')
      return
    }
    setLocating(true)
    devicePosition(
      position => {
        if (quiet && (pinnedByHand.current || pick !== pickId.current)) {
          setLocating(false)
          return
        }
        setLatitude(position.coords.latitude.toFixed(6))
        setLongitude(position.coords.longitude.toFixed(6))
        setLocationSource('device')
        setLocating(false)
        setGpsProblem('')
      },
      reason => {
        setLocating(false)
        setGpsProblem(locationProblem(reason))
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }
  async function submit() {
    if (!photo || !category) {
      setError('Add a photo and category.')
      return
    }
    if (!validCoordinates(latitude, longitude)) {
      setError('Enter valid coordinates.')
      return
    }
    if (autoFilled && !confirmed) return
    if (!joining) {
      // Ask first if this looks like something already reported; a failed check never blocks the report.
      setChecking(true)
      const found = await findNearby(category, latitude, longitude).catch(() => null)
      setChecking(false)
      if ((found?.own?.length ?? 0) > 0 || (found?.cases?.length ?? 0) > 0) {
        setNearby(found)
        return
      }
    }
    send()
  }
  function send(caseId = joining?.id) {
    if (!photo || !category) return
    setNearby(null)
    const form = new FormData()
    form.set('image', photo)
    form.set('resident_category', category)
    form.set('latitude', latitude)
    form.set('longitude', longitude)
    if (description.trim()) form.set('description', description.trim())
    if (caseId) form.set('case_id', caseId)
    if (locationSource) form.set('location_source', locationSource)
    dismissedHazards.forEach(hazard => form.append('dismissed_hazards', hazard))
    if (details?.takenAt) form.set('photo_taken_at', details.takenAt)
    if (details?.camera) form.set('photo_camera', '1')
    if (photoGps) {
      form.set('photo_latitude', String(photoGps[0]))
      form.set('photo_longitude', String(photoGps[1]))
    }
    submitReport.mutate(form, {
      onSuccess: report => {
        navigator.vibrate?.(25)
        reportSent()
        setSubmitted(report)
      },
      onError: caught => setError(reportErrorMessage(caught)),
    })
  }
  /** Adds this photo and note to the resident's own open report instead of opening a second one. */
  async function addToOwn(reportId: string) {
    if (!photo) return
    const form = new FormData()
    form.set('note', description.trim() || t('Another photo of the same problem.'))
    form.set('image', photo)
    setAdding(true)
    try {
      await post(`/reports/${reportId}/addenda`, form)
      await queryClient.invalidateQueries({ queryKey: reportKeys.all })
      reportSent()
      setNearby(null)
      navigate(`/reports/${reportId}`)
    } catch (caught) {
      setNearby(null)
      setError(reportErrorMessage(caught))
    } finally {
      setAdding(false)
    }
  }
  function startOver() {
    setParams({}, { replace: true })
    setDetails(null)
    setPhotoGps(null)
    setSubmitted(null)
    setPhoto(null)
    setPhotoRedrawn(false)
    setPreview('')
    setBlurred(null)
    setPrediction(null)
    setDismissedHazards([])
    setCategory('')
    setDescription('')
    setLatitude('')
    setLongitude('')
    setShowMap(false)
    setAiFilled(NOT_FILLED)
    setLocationSource(null)
    setGpsProblem('')
    setConfirmedFor(null)
    carriedCategory.current = null
    setRestoredAi(NO_AI)
    pinnedByHand.current = false
    setDirection(-1)
    setStep(0)
  }

  if (submitted) return <SuccessView report={submitted} onAnother={startOver} />
  if (offer) return <ContinueDraft draft={offer} onContinue={() => restoreDraft(offer)} onDiscard={discardDraft} />

  const ready = [Boolean(photo), validCoordinates(latitude, longitude), Boolean(category), true]
  const located = validCoordinates(latitude, longitude)
  const coordinates = located ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : ''
  const hazards = prediction?.hazards ?? []
  const showSafety = category === 'exposed_wiring' || hazards.includes('electrical_hazard')
  return (
    <div data-fit className="pt-3 lg:mx-auto lg:max-w-6xl lg:pt-0">
      <LargeTitle bar title={t('Make a report')} trailing={<ResidentAccount />} />
      {joining && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-tint p-3.5">
          <Users className="mt-0.5 size-5 shrink-0 text-link" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[14.5px]">
            <strong className="block font-semibold">
              {t('Adding to')}: {t(label(joining.category))}
            </strong>
            <span className="text-muted-foreground">
              {joining.location_label ? `${joining.location_label} · ` : ''}
              <Txt>Your photo, pin and time become evidence for this issue once staff check it.</Txt>
            </span>
          </p>
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            aria-label={t('Report a separate issue instead')}
            className="group -m-2 grid size-11 shrink-0 place-items-center rounded-full"
          >
            <span className="grid size-7 place-items-center rounded-full bg-background/70 text-muted-foreground group-hover:text-foreground">
              <X className="size-4" strokeWidth={2.5} />
            </span>
          </button>
        </div>
      )}
      {/* Phones show it until a photo is chosen (and again once sent), so every step fits on one screen. */}
      <p className={cn('mb-3 px-1 text-[13px] text-muted-foreground', (step > 0 || photo) && 'max-lg:hidden')}>
        <Txt>Not for emergencies. If anyone is in danger, call 911.</Txt>
      </p>
      {/* Desktop: the steps on the left, a live summary of the report on the right. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-10">
        <div>
          <div className="mb-3 lg:mb-5">
            <div className="mb-2 flex items-baseline justify-between text-[15px]">
              <h2 ref={stepHeading} tabIndex={-1} className="text-[15px] font-extrabold tracking-normal outline-none">
                <Txt>{STEPS[step]}</Txt>
              </h2>
              <span className="font-bold text-muted-foreground">
                {t('Step')} {step + 1} {t('of')} {STEPS.length}
              </span>
            </div>
            {/* Said aloud: the green line below appears without moving focus. */}
            <span className="sr-only" aria-live="polite">
              {step === 1 && located ? `${t('Location set')}: ${streetName ?? coordinates}` : ''}
              {step === 0 ? blurLine : ''}
            </span>
            {/* Duolingo's lesson bar: one thick track, a springy green fill with a highlight along its top. */}
            <div className="h-4 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <m.i
                className="relative block h-full origin-left rounded-full bg-primary after:absolute after:inset-x-2 after:top-1 after:h-1 after:rounded-full after:bg-white/35"
                initial={false}
                animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              />
            </div>
            {/* Shorter phones drop the coach on Details and Review, the two fullest steps, and the open map needs
                his room on Location, so each fits. */}
            <div
              className={cn(
                'mt-2 flex items-end gap-2 lg:hidden',
                step >= 2 && '[@media(max-height:820px)]:hidden',
                step === 1 && showMap && 'hidden',
              )}
            >
              <Kap key={step} pose={COACH[step].pose} motion="pop" interactive className="h-14 shrink-0" />
              <AnimatePresence mode="wait" initial={false}>
                <m.p
                  key={step === 0 && blurLine ? 'blurred' : step}
                  className="kap-bubble kap-bubble-left relative mb-2 rounded-2xl border-2 bg-card px-3 py-1.5 text-[13.5px] leading-snug font-bold"
                  initial={{ opacity: 0, scale: 0.92, x: -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  {step === 0 && blurLine ? blurLine : <Txt>{COACH[step].line}</Txt>}
                </m.p>
              </AnimatePresence>
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={step}
              className="space-y-3"
              custom={direction}
              variants={{
                enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
                center: { opacity: 1, x: 0 },
                exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: EASE }}
            >
              {step === 0 && (
                <PhotoStep
                  photo={photo}
                  preparing={preparing}
                  preview={preview}
                  previewState={photoState}
                  prediction={prediction}
                  blurLine={blurLine}
                  onSelect={selectPhoto}
                  onDrop={pickPhoto}
                />
              )}
              {step === 1 && (
                <LocationStep
                  locating={locating}
                  onLocate={() => locate()}
                  showMap={showMap}
                  onToggleMap={() => setShowMap(!showMap)}
                  located={located}
                  streetName={streetName}
                  coordinates={coordinates}
                  locationSource={locationSource}
                  place={place}
                  gpsProblem={gpsProblem}
                  latitude={latitude}
                  longitude={longitude}
                  onPlacePin={placePin}
                />
              )}
              {step === 2 && (
                <DetailsStep
                  category={category}
                  onCategory={value => {
                    setCategory(value)
                    setAiFilled(current => ({ ...current, category: false }))
                  }}
                  aiCategory={aiCategory}
                  prediction={prediction}
                  desktop={desktop}
                  hazards={hazards}
                  dismissedHazards={dismissedHazards}
                  onDismissedHazards={setDismissedHazards}
                  showSafety={showSafety}
                  description={description}
                  onDescription={value => {
                    setDescription(value)
                    setAiFilled(current => ({ ...current, description: false }))
                  }}
                  aiDescription={aiDescription}
                />
              )}
              {step === 3 && (
                <ReviewStep
                  preview={preview}
                  photoState={photoState}
                  photoName={photo?.name}
                  streetName={streetName}
                  coordinates={coordinates}
                  autoLocation={autoLocation}
                  category={category}
                  aiCategory={aiCategory}
                  carried={carried}
                  description={description}
                  aiDescription={aiDescription}
                  autoFilled={autoFilled}
                  confirmed={confirmed}
                  onConfirm={value => setConfirmedFor(value ? shown : null)}
                  onEdit={go}
                />
              )}
            </m.div>
          </AnimatePresence>
          {error && (
            <Alert className="mt-4">
              <Txt>{error}</Txt>
            </Alert>
          )}
          {step === 1 && !located && (
            <p id="location-needed" className="mt-3 px-1 text-[13px] leading-snug text-muted-foreground">
              <Txt>Set the location to continue: tap Use GPS, or open the map and tap the spot.</Txt>
            </p>
          )}
          {/* Phones: a solid action bar pinned above the tabs, like Duolingo's CHECK bar. */}
          <div className="sticky bottom-[var(--tab-offset)] z-20 -mx-4 mt-4 flex gap-2.5 border-t-2 bg-background px-4 py-2.5 sm:-mx-6 sm:px-6 md:bottom-24 md:mx-0 md:rounded-2xl md:border-2 md:px-3 lg:static lg:border-0 lg:p-0">
            {step > 0 && (
              <Button
                variant="outline"
                className="size-12 shrink-0 px-0 lg:size-14"
                type="button"
                onClick={() => go(step - 1)}
                aria-label={t('Back')}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                size="lg"
                className="flex-1 max-lg:min-h-12"
                type="button"
                disabled={!ready[step]}
                aria-describedby={step === 1 && !located ? 'location-needed' : undefined}
                onClick={() => go(step + 1)}
              >
                <Txt>Next</Txt> <ChevronRight />
              </Button>
            ) : (
              <Button
                size="lg"
                className="flex-1 max-lg:min-h-12"
                type="button"
                disabled={submitReport.isPending || checking || (autoFilled && !confirmed)}
                onClick={() => void submit()}
              >
                {(submitReport.isPending || checking) && <LoaderCircle className="animate-spin" />}
                <Txt>{submitReport.isPending || checking ? 'Submitting…' : 'Submit report'}</Txt>
              </Button>
            )}
          </div>
        </div>
        <NearbySheet
          nearby={nearby}
          adding={adding}
          onClose={() => setNearby(null)}
          onAddToOwn={reportId => void addToOwn(reportId)}
          onJoinCase={caseId => send(caseId)}
          onSubmitAnyway={() => send()}
        />
        <Summary
          step={step}
          preview={preview}
          previewState={photoState}
          location={located ? (streetName ?? coordinates) : ''}
          category={category}
          description={description.trim()}
          onEdit={go}
        />
      </div>
    </div>
  )
}
