import { useState, type ChangeEvent } from 'react'
import { m } from 'motion/react'
import { Camera, CheckCircle2, ImagePlus, LoaderCircle, Sparkles } from 'lucide-react'
import { Kap } from '@/components/Kap'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../../lib/i18n'
import { label } from '../categories'
import type { Prediction } from '../types'
import { ProtectedPhoto, type PreviewState } from './shared'

/** Step 1 of 4: the photo, with Kap's blur line and the AI's first read of it. */
export function PhotoStep({
  photo,
  preparing,
  preview,
  previewState,
  prediction,
  blurLine,
  onSelect,
  onDrop,
}: {
  photo: File | null
  preparing: boolean
  preview: string
  previewState: PreviewState
  prediction: Prediction | null
  blurLine: string
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void
  onDrop: (file: File) => void
}) {
  const t = useText()
  const [dragging, setDragging] = useState(false)
  const tile =
    'hairline relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-4 text-[16px] font-semibold transition-[transform,box-shadow,background-color] active:scale-[0.98] has-focus-visible:ring-2 has-focus-visible:ring-ring lg:min-h-44'
  return (
    <>
      <p className="text-[15px] text-muted-foreground max-lg:hidden">
        <Txt>Take a clear photo. The AI fills in the details to help you; check them and change anything wrong.</Txt>
      </p>
      {preview && (
        <m.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
          <ProtectedPhoto src={preview} state={previewState} className="hairline aspect-[3/1] rounded-2xl xl:hidden" />
        </m.div>
      )}
      {/* Desktops have no coach above the steps, so Kap says it here; phones say it in the coach's bubble. */}
      {blurLine && (
        <div className="flex items-end gap-2 max-lg:hidden">
          <Kap pose="thumbs" className="h-12 shrink-0" />
          <p className="kap-bubble kap-bubble-left relative mb-2 rounded-2xl border-2 bg-card px-3 py-1.5 text-[13.5px] leading-snug font-bold">
            {blurLine}
          </p>
        </div>
      )}
      {preparing && (
        <p className="flex items-center gap-2 px-1 text-[14px] text-muted-foreground" role="status">
          <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Txt>Preparing photo…</Txt>
        </p>
      )}
      {photo && (
        <p className="flex items-center gap-2 px-1 text-[14px] text-muted-foreground max-lg:sr-only" role="status">
          <CheckCircle2 className="size-4 shrink-0 text-[var(--status-resolved)]" />
          <span className="truncate">
            <Txt>Selected photo:</Txt> {photo.name}
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label
          className={cn(tile, 'bg-primary text-primary-foreground', photo && 'min-h-12 flex-row py-2 lg:min-h-16')}
        >
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
            'bg-card text-link',
            photo && 'min-h-12 flex-row py-2 lg:min-h-16',
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
      <p className={cn('px-1 text-[13px] text-muted-foreground', photo && 'max-lg:hidden')}>
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
    <div
      aria-live="polite"
      className={cn('hairline flex gap-3 rounded-2xl p-3 text-[14px] lg:p-4', prediction ? 'bg-card' : 'shimmer')}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-tint text-link">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 lg:text-[15px]">
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
