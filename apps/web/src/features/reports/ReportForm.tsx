import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m } from 'motion/react'
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Info,
  Lightbulb,
  LoaderCircle,
  LocateFixed,
  Map as MapIcon,
  Plus,
  Sparkles,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Kap, kapAvailable } from '@/components/Kap'
import { DateText } from '@/components/DateText'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Alert, LargeTitle } from '@/components/page'
import { cn } from '@/lib/utils'
import { post } from '../../lib/api'
import { Txt, useLanguage, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { categories, hazardLabels, label } from './categories'
import { CategoryTile } from './CategoryIcon'
import { describePrompts, toggleAnswer } from './describe'
import { MapPicker } from './MapPicker'
import { devicePosition, photoCoordinates, useBarangayAt, useStreetName, type LocationSource } from './location'
import { compressPhoto, MAX_PICK_BYTES, MAX_UPLOAD_BYTES, photoDetails, type PhotoDetails } from './photo'
import { findNearby, reportKeys, useCommunityCases, useSubmitReport } from './queries'
import type { Category, Hazard, Nearby, Prediction, Report } from './types'

const UNAVAILABLE: Prediction = { prediction_available: false, model_category: null, confidence: null }
const NOT_FILLED = { category: false, description: false }
const STEPS = ['Photo', 'Location', 'Details', 'Review'] as const
const EASE = [0.22, 1, 0.36, 1] as const
const PATH = ['Pending', 'Under Verification', 'Accepted', 'In Progress', 'Resolved']

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

function validCoordinates(latitude: string, longitude: string) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return latitude !== '' && longitude !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('hairline rounded-2xl bg-card p-4', className)}>{children}</div>
}

export function ReportForm() {
  const t = useText()
  const submitReport = useSubmitReport()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [dismissedHazards, setDismissedHazards] = useState<Hazard[]>([])
  const [category, setCategory] = useState<Category | ''>('')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState<Report | null>(null)
  // Which fields the AI filled from the photo; editing a field hands it back to the resident.
  const [aiFilled, setAiFilled] = useState(NOT_FILLED)
  const [locationSource, setLocationSource] = useState<LocationSource>(null)
  // The latest photo pick; a slower shrink of an earlier pick must not replace it.
  const pickId = useRef(0)
  const [pickKey, setPickKey] = useState(0)
  const [preparing, setPreparing] = useState(false)
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
  const aiCategory = aiFilled.category && category === prediction?.model_category
  const aiDescription = aiFilled.description && description === prediction?.suggested_description
  const autoLocation = locationSource === 'photo' || locationSource === 'device'
  // The case's staff-verified category, offered to the resident; it becomes theirs only once they confirm it.
  const caseCategory = Boolean(joining) && category === joining?.category
  // Auto-fill only assists: whatever it filled must be confirmed by the resident before sending.
  const autoFilled = aiCategory || aiDescription || autoLocation || caseCategory
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
    return () => URL.revokeObjectURL(url)
  }, [photo])
  useEffect(() => {
    if (!photo) return
    const controller = new AbortController()
    const form = new FormData()
    form.set('image', photo)
    form.set('language', language)
    void post<Prediction>('/reports/predict', form, { signal: controller.signal })
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
    return () => controller.abort()
    // Analyse each photo once, in the language in use when it was chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo])

  function go(next: number) {
    setDirection(next > step ? 1 : -1)
    setError('')
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset native inputs so selecting the same photo again still fires change.
    event.target.value = ''
    if (file) pickPhoto(file)
  }
  function pickPhoto(file: File) {
    setPhoto(null)
    setPreview('')
    // "I see this too" keeps the case's category; otherwise the new photo's AI answer fills it.
    setCategory(joining?.category ?? '')
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
    pinnedByHand.current = true
  }
  /**
   * Quiet mode is the automatic attempt after a photo: a refusal shows no error, the resident just sets the pin.
   * Its answer is dropped once the resident has set the pin or picked another photo.
   */
  function locate(quiet = false, pick = pickId.current) {
    if (!navigator.geolocation) {
      if (!quiet) setError('GPS is unavailable. Enter coordinates or place a pin on the map.')
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
        if (!quiet) setError('')
      },
      () => {
        setLocating(false)
        if (!quiet) setError('Location access was unavailable. Enter coordinates or place a pin on the map.')
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
        setSubmitted(report)
      },
      onError: caught => setError(caught.message),
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
      setNearby(null)
      navigate(`/reports/${reportId}`)
    } catch (caught) {
      setNearby(null)
      setError(caught instanceof Error ? caught.message : 'Request failed')
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
    setPreview('')
    setPrediction(null)
    setDismissedHazards([])
    setCategory('')
    setDescription('')
    setLatitude('')
    setLongitude('')
    setShowMap(false)
    setAiFilled(NOT_FILLED)
    setLocationSource(null)
    setConfirmedFor(null)
    pinnedByHand.current = false
    setDirection(-1)
    setStep(0)
  }

  if (submitted) return <SuccessView report={submitted} onAnother={startOver} />

  const ready = [Boolean(photo), validCoordinates(latitude, longitude), Boolean(category), true]
  const located = validCoordinates(latitude, longitude)
  const coordinates = located ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : ''
  const hazards = prediction?.hazards ?? []
  const showSafety = category === 'exposed_wiring' || hazards.includes('electrical_hazard')
  return (
    <div className="lg:mx-auto lg:max-w-6xl">
      <LargeTitle title={t('Make a report')} trailing={<ResidentAccount />} />
      {joining && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-tint p-3.5">
          <Users className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
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
      <p className="mb-3 px-1 text-[13px] text-muted-foreground">
        <Txt>Not for emergencies. If anyone is in danger, call 911.</Txt>
      </p>
      {/* Desktop: the steps on the left, a live summary of the report on the right. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-10">
        <div>
          <div className="mb-4">
            <div className="mb-2 flex items-baseline justify-between text-[15px]">
              <strong className="font-semibold">
                <Txt>{STEPS[step]}</Txt>
              </strong>
              <span className="text-muted-foreground">
                {t('Step')} {step + 1} {t('of')} {STEPS.length}
              </span>
            </div>
            <div className="flex gap-1.5" aria-hidden="true">
              {STEPS.map((name, index) => (
                <span key={name} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <m.i
                    className="block h-full origin-left rounded-full bg-primary"
                    initial={false}
                    animate={{ scaleX: index <= step ? 1 : 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  />
                </span>
              ))}
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
                  prediction={prediction}
                  onSelect={selectPhoto}
                  onDrop={pickPhoto}
                />
              )}
              {step === 1 && (
                <>
                  <p className="text-[15px] text-muted-foreground">
                    <Txt>Use GPS, move a map pin, or enter coordinates.</Txt>
                  </p>
                  <Card className="space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <Button
                        className="w-full whitespace-normal lg:h-[52px]"
                        type="button"
                        onClick={() => locate()}
                        disabled={locating}
                      >
                        {locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
                        <Txt>{locating ? 'Finding your location…' : 'Use GPS'}</Txt>
                      </Button>
                      <Button
                        variant="tinted"
                        className="w-full whitespace-normal lg:h-[52px]"
                        type="button"
                        onClick={() => setShowMap(!showMap)}
                      >
                        <MapIcon />
                        <Txt>{showMap ? 'Hide map' : 'Adjust pin on map'}</Txt>
                      </Button>
                    </div>
                    {located && (
                      <m.p
                        className="flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,var(--status-resolved)_12%,transparent)] px-3 py-2.5 text-[15px] font-medium text-[var(--status-resolved)]"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <CheckCircle2 className="size-5 shrink-0" />
                        <span className="min-w-0">
                          <Txt>Location set</Txt> · {streetName ?? coordinates}
                          {locationSource && locationSource !== 'manual' && (
                            <span className="block text-[13px] font-normal opacity-80">
                              <Txt>{locationSource === 'photo' ? 'From your photo' : 'From your phone'}</Txt>
                              {streetName && ` · ${coordinates}`}
                            </span>
                          )}
                          {place?.barangay && (
                            <span className="block text-[13px] font-normal opacity-80">
                              <Txt>Barangay</Txt> {place.barangay}
                            </span>
                          )}
                        </span>
                      </m.p>
                    )}
                    {located && place?.active && !place.barangay && (
                      <p
                        role="status"
                        className="flex items-start gap-2 rounded-xl bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] px-3 py-2.5 text-[14px] text-[var(--status-pending)]"
                      >
                        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <Txt>
                          This pin is outside the area we cover. You can still send it, and an administrator will review
                          it.
                        </Txt>
                      </p>
                    )}
                  </Card>
                  {showMap && (
                    <div className="hairline overflow-hidden rounded-2xl">
                      <MapPicker
                        latitude={latitude ? Number(latitude) : null}
                        longitude={longitude ? Number(longitude) : null}
                        onPick={(lat, lng) => placePin(String(lat), String(lng))}
                      />
                    </div>
                  )}
                  <details className="group hairline rounded-2xl bg-card">
                    <summary className="flex min-h-12 items-center justify-between px-4 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                      <Txt>Enter coordinates manually</Txt>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                      <label className="space-y-1.5 text-[14px] font-medium text-muted-foreground">
                        <Txt>Latitude</Txt>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="-90"
                          max="90"
                          value={latitude}
                          onChange={event => placePin(event.target.value, longitude)}
                          placeholder="14.326900"
                          className="text-foreground"
                        />
                      </label>
                      <label className="space-y-1.5 text-[14px] font-medium text-muted-foreground">
                        <Txt>Longitude</Txt>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="-180"
                          max="180"
                          value={longitude}
                          onChange={event => placePin(latitude, event.target.value)}
                          placeholder="120.936400"
                          className="text-foreground"
                        />
                      </label>
                    </div>
                  </details>
                </>
              )}
              {step === 2 && (
                <>
                  <fieldset>
                    <legend className="mb-2 flex w-full items-center justify-between gap-2 px-1 text-[15px] font-semibold">
                      <Txt>Incident category</Txt>
                      {aiCategory && <AiTag check={prediction?.needs_check} />}
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {categories.map(item => (
                        <label
                          key={item.value}
                          className="hairline relative flex min-h-13 items-center gap-3 rounded-2xl bg-card p-3 pr-9 text-[15px] leading-snug font-medium transition-[box-shadow,background-color] has-checked:bg-tint has-checked:shadow-[0_0_0_2px_var(--primary)] has-focus-visible:ring-2 has-focus-visible:ring-ring"
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name="category"
                            value={item.value}
                            required
                            checked={category === item.value}
                            onChange={() => {
                              setCategory(item.value)
                              setAiFilled(current => ({ ...current, category: false }))
                            }}
                          />
                          <CategoryTile category={item.value} />
                          <Txt>{item.label}</Txt>
                          {category === item.value && (
                            <m.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                              className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground"
                            >
                              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                            </m.span>
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {category === 'broken_streetlights' && (
                    <p className="flex items-start gap-1.5 px-1 text-[13px] text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <Txt>
                        A photo cannot show whether a light works. Choose this only if it stays off at night or is
                        visibly damaged.
                      </Txt>
                    </p>
                  )}
                  {hazards.length > 0 && (
                    <div className="space-y-1 px-1 text-[13px] text-muted-foreground">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        <Txt>The AI noticed:</Txt>
                        {hazards.map(hazard => {
                          const kept = !dismissedHazards.includes(hazard)
                          return (
                            <button
                              key={hazard}
                              type="button"
                              aria-pressed={kept}
                              onClick={() =>
                                setDismissedHazards(current =>
                                  kept ? [...current, hazard] : current.filter(item => item !== hazard),
                                )
                              }
                              className={cn(
                                'inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 font-medium',
                                kept
                                  ? 'bg-[color-mix(in_oklab,var(--status-progress)_13%,transparent)] text-[var(--status-progress)]'
                                  : 'border border-dashed line-through',
                              )}
                            >
                              <Txt>{hazardLabels[hazard] ?? hazard}</Txt>
                              {kept && <X className="size-3" aria-hidden="true" />}
                            </button>
                          )
                        })}
                      </p>
                      <p>
                        <Txt>Tap any that are wrong to remove them.</Txt>
                      </p>
                    </div>
                  )}
                  <AnimatePresence>
                    {showSafety && (
                      <m.div
                        role="note"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2.5 rounded-2xl bg-[color-mix(in_oklab,var(--status-progress)_13%,transparent)] p-3 text-[14px] leading-snug">
                          <TriangleAlert className="size-5 shrink-0 text-[var(--status-progress)]" aria-hidden="true" />
                          <span>
                            <Txt>
                              Stay well away and do not touch the wire or anything it touches. If it is sparking or on
                              the ground, warn people nearby and call your barangay or electric company right away.
                            </Txt>
                          </span>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                  <label className="block space-y-2">
                    <span className="flex items-center justify-between gap-2 px-1 text-[15px] font-semibold">
                      <Txt>Description (optional)</Txt>
                      {aiDescription && <AiTag check={prediction?.problem_seen === false} />}
                    </span>
                    <Textarea
                      rows={2}
                      className="min-h-16"
                      maxLength={1000}
                      placeholder={t('What happened? Add details the photo may not show.')}
                      value={description}
                      onChange={event => {
                        setDescription(event.target.value)
                        setAiFilled(current => ({ ...current, description: false }))
                      }}
                    />
                    {!aiDescription && (
                      <span className="hidden items-center gap-1.5 px-1 text-[13px] font-normal text-muted-foreground sm:flex">
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        <Txt>The AI writes this from your photo when it can. Add a short note if it did not.</Txt>
                      </span>
                    )}
                  </label>
                  {category && (
                    <DescribeHelp
                      category={category}
                      description={description}
                      onChange={text => {
                        setDescription(text.slice(0, 1000))
                        setAiFilled(current => ({ ...current, description: false }))
                      }}
                    />
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <div className="hairline overflow-hidden rounded-2xl bg-card">
                    {preview && (
                      <img
                        className="aspect-[2/1] w-full object-cover lg:aspect-[3/1]"
                        src={preview}
                        alt={t('Preview of incident photo')}
                      />
                    )}
                    <dl>
                      {[
                        { term: 'Photo', value: photo?.name, edit: 0, auto: false },
                        {
                          term: 'Location',
                          value: streetName ? `${streetName} (${coordinates})` : coordinates,
                          edit: 1,
                          auto: autoLocation,
                        },
                        { term: 'Incident category', value: t(label(category || null)), edit: 2, auto: aiCategory },
                        {
                          term: 'Description (optional)',
                          value: description.trim() || t('No description added'),
                          edit: 2,
                          auto: aiDescription,
                        },
                      ].map(item => (
                        <div key={item.term} className="flex items-start gap-3 border-t px-4 py-3 first:border-t-0">
                          <div className="min-w-0 flex-1">
                            <dt className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                              <Txt>{item.term}</Txt>
                              {item.auto && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] px-2 py-0.5 text-[12px] font-semibold text-[var(--status-pending)]">
                                  <Sparkles className="size-3" aria-hidden="true" />
                                  <Txt>Auto-filled · check</Txt>
                                </span>
                              )}
                            </dt>
                            <dd className="mt-0.5 text-[16px] break-words">{item.value}</dd>
                          </div>
                          <button
                            className="-my-1 min-h-11 px-1 text-[15px] font-medium text-primary"
                            type="button"
                            onClick={() => go(item.edit)}
                          >
                            <Txt>Edit</Txt>
                          </button>
                        </div>
                      ))}
                    </dl>
                  </div>
                  {autoFilled && (
                    <AutoFillCheck confirmed={confirmed} onConfirm={value => setConfirmedFor(value ? shown : null)} />
                  )}
                </>
              )}
            </m.div>
          </AnimatePresence>
          {error && (
            <Alert className="mt-4">
              <Txt>{error}</Txt>
            </Alert>
          )}
          <div className="sticky bottom-[calc(var(--tab-offset)+12px)] z-20 mt-6 flex gap-2.5 md:bottom-28 lg:static">
            {step > 0 && (
              <Button
                variant="secondary"
                className="glass hairline size-[52px] shrink-0 rounded-2xl px-0"
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
                className="flex-1 shadow-[0_8px_20px_-8px_rgb(29_100_216/0.6)]"
                type="button"
                disabled={!ready[step]}
                onClick={() => go(step + 1)}
              >
                <Txt>Next</Txt> <ChevronRight />
              </Button>
            ) : (
              <Button
                size="lg"
                className="flex-1 shadow-[0_8px_20px_-8px_rgb(29_100_216/0.6)]"
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
          location={located ? (streetName ?? coordinates) : ''}
          category={category}
          description={description.trim()}
          onEdit={go}
        />
      </div>
    </div>
  )
}

/** Desktop only: what the resident has filled in so far, with a jump back to any finished step. */
function Summary({
  step,
  preview,
  location,
  category,
  description,
  onEdit,
}: {
  step: number
  preview: string
  location: string
  category: Category | ''
  description: string
  onEdit: (step: number) => void
}) {
  const t = useText()
  const rows = [
    { label: 'Photo', done: Boolean(preview), value: preview ? t('Added') : t('Not added yet'), step: 0 },
    { label: 'Location', done: Boolean(location), value: location || t('Not set yet'), step: 1 },
    {
      label: 'Incident category',
      done: Boolean(category),
      value: category ? t(label(category)) : t('Not chosen yet'),
      step: 2,
    },
    {
      label: 'Description (optional)',
      done: Boolean(description),
      value: description || t('No description added'),
      step: 2,
    },
  ]
  return (
    <aside className="sticky top-10 hidden space-y-4 xl:block">
      <div className="hairline overflow-hidden rounded-2xl bg-card">
        {preview ? (
          <img className="aspect-[2/1] w-full object-cover" src={preview} alt={t('Preview of incident photo')} />
        ) : (
          <div className="grid aspect-[2/1] place-items-center bg-muted text-muted-foreground">
            <Camera className="size-8" aria-hidden="true" />
          </div>
        )}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {category && <CategoryTile category={category} size="sm" />}
          <strong className="text-[16px] font-semibold">
            <Txt>Your report</Txt>
          </strong>
        </div>
        <ul>
          {rows.map(row => (
            <li key={row.label} className="flex items-start gap-3 px-4 py-2.5 [&+&]:border-t">
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2',
                  row.done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                )}
              >
                {row.done && <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-muted-foreground">
                  <Txt>{row.label}</Txt>
                </span>
                <span className="block truncate text-[15px]">{row.value}</span>
              </span>
              {row.step < step && (
                <button
                  type="button"
                  onClick={() => onEdit(row.step)}
                  className="text-[14px] font-medium text-primary hover:underline"
                >
                  <Txt>Edit</Txt>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-tint p-4">
        <Kap pose="idea" className="h-20 w-auto shrink-0" />
        <p className="text-[14px] text-foreground/80">
          <Txt>Stand where you can see the whole problem, and keep faces and plate numbers out of the photo.</Txt>
        </p>
      </div>
    </aside>
  )
}

/** Marks a field the AI filled in from the photo; it disappears once the resident edits that field. */
function AiTag({ check = false }: { check?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold',
        check
          ? 'bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] text-[var(--status-pending)]'
          : 'bg-tint text-primary',
      )}
    >
      <Sparkles className="size-3" aria-hidden="true" />
      <Txt>{check ? 'AI unsure · please check' : 'Filled by AI · you can edit'}</Txt>
    </span>
  )
}

/** Tap-to-add answers that prompt the details staff need and a photo cannot show (depth, size, since when). */
function DescribeHelp({
  category,
  description,
  onChange,
}: {
  category: Category
  description: string
  onChange: (text: string) => void
}) {
  const t = useText()
  return (
    <section className="hairline space-y-3 rounded-2xl bg-card p-4" aria-labelledby="describe-help">
      <h2 id="describe-help" className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Lightbulb className="size-4 text-primary" aria-hidden="true" />
        <Txt>Help me describe it</Txt>
      </h2>
      {describePrompts[category].map(prompt => {
        const answers = prompt.answers.map(t)
        return (
          <div key={prompt.question} role="group" aria-label={t(prompt.question)} className="space-y-1.5">
            <p className="text-[13px] text-muted-foreground">
              <Txt>{prompt.question}</Txt>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {answers.map(answer => {
                const chosen = description.includes(answer)
                return (
                  <button
                    key={answer}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => onChange(toggleAnswer(description, answers, answer))}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[14px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      chosen ? 'bg-primary text-primary-foreground' : 'bg-tint text-primary',
                    )}
                  >
                    {chosen ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Plus className="size-3.5" aria-hidden="true" />
                    )}
                    {answer.replace(/\.$/, '')}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Auto-fill is only an aid: the resident must confirm what the AI and GPS filled in before sending. */
function AutoFillCheck({ confirmed, onConfirm }: { confirmed: boolean; onConfirm: (value: boolean) => void }) {
  return (
    <div className="hairline space-y-3 rounded-2xl bg-card p-4">
      <p className="flex gap-2.5 text-[14px] leading-snug">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--status-pending)]" aria-hidden="true" />
        <span>
          <Txt>
            Auto-fill only helps you fill in this form. The AI and GPS can be wrong, so check that the category,
            location, and description are correct. Barangay personnel still verify every report.
          </Txt>
        </span>
      </p>
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-[15px] font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-[var(--primary)]"
          checked={confirmed}
          onChange={event => onConfirm(event.target.checked)}
        />
        <Txt>I checked the auto-filled details and they are correct.</Txt>
      </label>
    </div>
  )
}

function PhotoStep({
  photo,
  preparing,
  preview,
  prediction,
  onSelect,
  onDrop,
}: {
  photo: File | null
  preparing: boolean
  preview: string
  prediction: Prediction | null
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void
  onDrop: (file: File) => void
}) {
  const t = useText()
  const [dragging, setDragging] = useState(false)
  const tile =
    'hairline relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-4 text-[16px] font-semibold transition-[transform,box-shadow,background-color] active:scale-[0.98] has-focus-visible:ring-2 has-focus-visible:ring-ring lg:min-h-44'
  return (
    <>
      <p className="text-[15px] text-muted-foreground">
        <Txt>Take a clear photo. The AI fills in the details to help you; check them and change anything wrong.</Txt>
      </p>
      {preview && (
        <m.img
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="hairline aspect-[2/1] w-full rounded-2xl object-cover lg:aspect-[3/1] xl:hidden"
          src={preview}
          alt={t('Preview of incident photo')}
        />
      )}
      {preparing && (
        <p className="flex items-center gap-2 px-1 text-[14px] text-muted-foreground" role="status">
          <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Txt>Preparing photo…</Txt>
        </p>
      )}
      {photo && (
        <p className="flex items-center gap-2 px-1 text-[14px] text-muted-foreground" role="status">
          <CheckCircle2 className="size-4 shrink-0 text-[var(--status-resolved)]" />
          <span className="truncate">
            <Txt>Selected photo:</Txt> {photo.name}
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className={cn(tile, 'bg-primary text-primary-foreground', photo && 'min-h-14 flex-row lg:min-h-16')}>
          <Camera className="size-7" aria-hidden="true" />
          <Txt>{photo ? 'Retake photo' : 'Take photo'}</Txt>
          <input
            className="sr-only"
            type="file"
            aria-label={t('Take photo')}
            accept="image/*"
            capture="environment"
            onChange={onSelect}
          />
        </label>
        {/* Desktop residents can drop a photo file here as well as browse for one. */}
        <label
          className={cn(
            tile,
            'bg-card text-primary',
            photo && 'min-h-14 flex-row lg:min-h-16',
            dragging && 'bg-tint shadow-[0_0_0_2px_var(--primary)]',
          )}
          onDragOver={event => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (file) onDrop(file)
          }}
        >
          <ImagePlus className="size-7" aria-hidden="true" />
          <Txt>{photo ? 'Choose another' : 'Choose photo'}</Txt>
          <span className={cn('hidden text-[13px] font-normal text-muted-foreground', !photo && 'lg:block')}>
            <Txt>or drag a photo here</Txt>
          </span>
          <input
            className="sr-only"
            type="file"
            aria-label={t('Incident photo · Choose photo')}
            accept="image/jpeg,image/png,image/webp"
            required={!photo}
            onChange={onSelect}
          />
        </label>
      </div>
      <p className="px-1 text-[13px] text-muted-foreground">
        <Txt>JPG, PNG, or WebP, up to 25 MB. Avoid faces and license plates.</Txt>
      </p>
      {photo && <AiCard prediction={prediction} />}
    </>
  )
}

/** AI suggestions only; this card must never read as a verified result. */
function AiCard({ prediction }: { prediction: Prediction | null }) {
  const [title, body] = !prediction
    ? ['Checking the photo…', 'You can continue while this runs.']
    : prediction.problem_seen === false
      ? [
          'AI is uncertain',
          'Nothing looks broken. We picked the closest category; please verify it and the description.',
        ]
      : prediction.model_category
        ? [
            '',
            prediction.suggested_description
              ? 'We filled in the category and a description. You can change both on the Details step.'
              : 'We filled in the category for you. You can change it on the Details step.',
          ]
        : prediction.prediction_available
          ? ['AI is uncertain', 'Choose the category yourself. Barangay personnel will verify it.']
          : ['AI classification unavailable', 'Choose the category yourself. Barangay personnel will verify it.']
  return (
    <div aria-live="polite" className={cn('hairline flex gap-3 rounded-2xl p-4', prediction ? 'bg-card' : 'shimmer')}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-tint text-primary">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 text-[15px]">
        <strong className="block font-semibold">
          {prediction?.model_category && prediction.problem_seen !== false ? (
            <>
              <Txt>AI suggests</Txt> <Txt>{label(prediction.model_category)}</Txt>
            </>
          ) : (
            <Txt>{title}</Txt>
          )}
        </strong>
        <span className="text-muted-foreground">
          <Txt>{body}</Txt>
        </span>
      </span>
    </div>
  )
}

function SuccessView({ report, onAnother }: { report: Report; onAnother: () => void }) {
  const t = useText()
  return (
    <div className="flex flex-col items-center pt-4 text-center lg:mx-auto lg:max-w-md lg:pt-6">
      {kapAvailable('cheer') ? (
        <m.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <Kap pose="cheer" className="h-32 w-auto lg:h-36" />
        </m.div>
      ) : (
        <svg className="size-24" viewBox="0 0 96 96" aria-hidden="true">
          <m.circle
            cx="48"
            cy="48"
            r="44"
            fill="var(--status-resolved)"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            style={{ originX: '50%', originY: '50%' }}
          />
          <m.path
            d="M30 49 l12 12 l24 -26"
            fill="none"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 0.35, ease: EASE }}
          />
        </svg>
      )}
      <h1 className="mt-3 text-[26px] font-bold">
        <Txt>Report sent</Txt>
      </h1>
      <p role="status" className="mt-1 max-w-sm text-[16px] text-muted-foreground">
        <Txt>Report submitted. Barangay personnel will review it.</Txt>
      </p>
      <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
        <Txt>Sending a report does not guarantee a response or a date. If anyone is in danger, call 911.</Txt>
      </p>
      <div className="hairline mt-4 w-full rounded-2xl bg-card p-4 text-left">
        <span className="text-[13px] text-muted-foreground">
          <Txt>Reference no.</Txt>
        </span>
        <strong className="mt-0.5 block font-mono text-[24px] font-semibold tracking-wider">
          {report.id.slice(0, 8).toUpperCase()}
        </strong>
        <ol className="mt-3 space-y-1.5 border-t pt-3" aria-label={t('Status path')}>
          {PATH.map((status, index) => (
            <li key={status} className="flex items-center gap-3 text-[15px]">
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full border-2',
                  index === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                )}
              >
                {index === 0 && <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />}
              </span>
              <span className={index === 0 ? 'font-semibold' : 'text-muted-foreground'}>
                <Txt>{status}</Txt>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[14px] text-muted-foreground">
          <Txt>Track it anytime in My reports.</Txt>
        </p>
      </div>
      <div className="mt-4 grid w-full gap-2">
        <Button asChild size="lg">
          <Link to={`/reports/${report.id}`}>
            <Txt>View my report</Txt>
          </Link>
        </Button>
        <Button variant="tinted" size="lg" type="button" onClick={onAnother}>
          <Txt>Make another report</Txt>
        </Button>
      </div>
    </div>
  )
}

/** "You already reported this": offered before a second report of the same issue is sent. */
function NearbySheet({
  nearby,
  adding,
  onClose,
  onAddToOwn,
  onJoinCase,
  onSubmitAnyway,
}: {
  nearby: Nearby | null
  adding: boolean
  onClose: () => void
  onAddToOwn: (reportId: string) => void
  onJoinCase: (caseId: string) => void
  onSubmitAnyway: () => void
}) {
  const t = useText()
  const own = nearby?.own[0]
  const shared = own ? undefined : nearby?.cases[0]
  return (
    <Sheet open={Boolean(nearby)} onOpenChange={open => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="items-center px-5 pt-6 text-center">
          {kapAvailable('thinking') && <Kap pose="thinking" className="mb-1 h-24 w-auto" />}
          <SheetTitle className="text-[20px] font-bold">
            <Txt>{own ? 'You already reported this' : 'Neighbours already reported this'}</Txt>
          </SheetTitle>
          <SheetDescription className="text-[15px]">
            <Txt>
              {own
                ? 'Your open report is close to this pin. Add this photo and note to it so staff see everything in one place.'
                : 'Barangay staff are already working on an issue close to this pin. Add your photo to it as evidence.'}
            </Txt>
          </SheetDescription>
        </SheetHeader>
        {(own || shared) && (
          <div className="mx-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-3.5">
            <CategoryTile category={(own?.resident_category ?? shared?.category)!} />
            <div className="min-w-0 flex-1 text-[14px]">
              <strong className="block truncate text-[15px] font-semibold">
                <Txt>{label(own?.resident_category ?? shared?.category ?? null)}</Txt>
              </strong>
              <span className="block text-muted-foreground">
                {own ? (
                  <>
                    #{own.id.slice(0, 8).toUpperCase()} ·{' '}
                    {own.created_at && <DateText value={own.created_at} compact />}
                  </>
                ) : (
                  <>
                    {shared?.location_label ?? ''} {shared?.contributors ?? 0} {t('residents')}
                  </>
                )}
                {' · '}
                {own?.distance_m ?? shared?.distance_m} m {t('away')}
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2.5 px-5 pt-2">
          {own && (
            <Button size="lg" disabled={adding} onClick={() => onAddToOwn(own.id)}>
              {adding && <LoaderCircle className="animate-spin" />}
              <Txt>Add to my report</Txt>
            </Button>
          )}
          {shared && (
            <Button size="lg" onClick={() => onJoinCase(shared.id)}>
              <Users />
              <Txt>Add my photo to this issue</Txt>
            </Button>
          )}
          <Button size="lg" variant="secondary" disabled={adding} onClick={onSubmitAnyway}>
            <Txt>It is a different problem. Send a new report</Txt>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
