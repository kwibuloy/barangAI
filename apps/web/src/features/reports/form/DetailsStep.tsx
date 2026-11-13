import { AnimatePresence, m } from 'motion/react'
import { Check, Info, Sparkles, TriangleAlert, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../../lib/i18n'
import { categories, hazardLabels } from '../categories'
import { CategoryTile } from '../CategoryIcon'
import type { Category, Hazard, Prediction } from '../types'
import { AiTag } from './shared'

/** Step 3 of 4: category, the AI's hazard flags and the description. Choosing or typing takes a field back from the AI. */
export function DetailsStep({
  category,
  onCategory,
  aiCategory,
  prediction,
  desktop,
  hazards,
  dismissedHazards,
  onDismissedHazards,
  showSafety,
  description,
  onDescription,
  aiDescription,
}: {
  category: Category | ''
  onCategory: (value: Category) => void
  aiCategory: boolean
  prediction: Prediction | null
  desktop: boolean
  hazards: Hazard[]
  dismissedHazards: Hazard[]
  onDismissedHazards: (update: (current: Hazard[]) => Hazard[]) => void
  showSafety: boolean
  description: string
  onDescription: (value: string) => void
  aiDescription: boolean
}) {
  const t = useText()
  return (
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
              className="hairline relative flex min-h-11 items-center gap-2.5 rounded-2xl bg-card px-2.5 py-2 pr-8 text-[14.5px] leading-tight font-medium lg:min-h-13 lg:gap-3 lg:p-3 lg:pr-9 lg:text-[15px] transition-[box-shadow,background-color] has-checked:bg-tint has-checked:shadow-[0_0_0_2px_var(--primary)] has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                className="sr-only"
                type="radio"
                name="category"
                value={item.value}
                required
                checked={category === item.value}
                onChange={() => onCategory(item.value)}
              />
              <CategoryTile category={item.value} size={desktop ? 'md' : 'sm'} />
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
            A photo cannot show whether a light works. Choose this only if it stays off at night or is visibly damaged.
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
                    onDismissedHazards(current =>
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
                  Stay well away and do not touch the wire or anything it touches. If it is sparking or on the ground,
                  warn people nearby and call your barangay or electric company right away.
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
          className="min-h-14 lg:min-h-16"
          maxLength={1000}
          placeholder={t('What happened? Add details the photo may not show.')}
          value={description}
          onChange={event => onDescription(event.target.value)}
        />
        {!aiDescription && (
          <span className="hidden items-center gap-1.5 px-1 text-[13px] font-normal text-muted-foreground sm:flex">
            <Sparkles className="size-3.5" aria-hidden="true" />
            <Txt>The AI writes this from your photo when it can. Add a short note if it did not.</Txt>
          </span>
        )}
      </label>
    </>
  )
}
