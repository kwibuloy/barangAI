import { Info, Sparkles } from 'lucide-react'
import { Txt, useText } from '../../../lib/i18n'
import { label } from '../categories'
import type { Category } from '../types'
import { ProtectedPhoto, type PreviewState } from './shared'

/** Step 4 of 4: everything at a glance, each with Edit, and the tick whenever an AI or GPS value is still in use. */
export function ReviewStep({
  preview,
  photoState,
  photoName,
  streetName,
  coordinates,
  autoLocation,
  category,
  aiCategory,
  carried,
  description,
  aiDescription,
  autoFilled,
  confirmed,
  onConfirm,
  onEdit,
}: {
  preview: string
  photoState: PreviewState
  photoName: string | undefined
  streetName: string | null | undefined
  coordinates: string
  autoLocation: boolean
  category: Category | ''
  aiCategory: boolean
  carried: boolean
  description: string
  aiDescription: boolean
  autoFilled: boolean
  confirmed: boolean
  onConfirm: (value: boolean) => void
  onEdit: (step: number) => void
}) {
  const t = useText()
  return (
    <>
      <div className="hairline overflow-hidden rounded-2xl bg-card">
        {preview && <ProtectedPhoto src={preview} state={photoState} className="aspect-[3/1] max-lg:hidden" />}
        <dl>
          {[
            { term: 'Photo', value: photoName, edit: 0, auto: false },
            {
              term: 'Location',
              value: streetName ? `${streetName} (${coordinates})` : coordinates,
              edit: 1,
              auto: autoLocation,
            },
            {
              term: 'Incident category',
              value: t(label(category || null)),
              edit: 2,
              auto: aiCategory || carried,
            },
            {
              term: 'Description (optional)',
              value: description.trim() || t('No description added'),
              edit: 2,
              auto: aiDescription,
            },
          ].map(item => (
            <div
              key={item.term}
              className="flex items-center gap-3 border-t px-3.5 py-1.5 first:border-t-0 lg:items-start lg:px-4 lg:py-3"
            >
              {item.edit === 0 && preview && (
                <ProtectedPhoto
                  thumb
                  src={preview}
                  state={photoState}
                  className="h-11 w-16 shrink-0 rounded-lg lg:hidden"
                />
              )}
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
                <dd className="mt-0.5 line-clamp-2 text-[15px] leading-snug break-words lg:line-clamp-none lg:text-[16px]">
                  {item.value}
                </dd>
              </div>
              <button
                className="-my-1 min-h-11 shrink-0 px-1 text-[15px] font-medium text-link"
                type="button"
                onClick={() => onEdit(item.edit)}
              >
                <Txt>Edit</Txt>
              </button>
            </div>
          ))}
        </dl>
      </div>
      {autoFilled && <AutoFillCheck confirmed={confirmed} onConfirm={onConfirm} />}
    </>
  )
}

/** Auto-fill is only an aid: the resident must confirm what the AI and GPS filled in before sending. */
function AutoFillCheck({ confirmed, onConfirm }: { confirmed: boolean; onConfirm: (value: boolean) => void }) {
  return (
    <div className="hairline space-y-2 rounded-2xl bg-card p-3 lg:space-y-3 lg:p-4">
      <p className="flex gap-2.5 text-[13px] leading-snug lg:text-[14px]">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--status-pending)]" aria-hidden="true" />
        <span>
          <Txt>
            Auto-fill only helps you fill in this form. The AI and GPS can be wrong, so check that the category,
            location, and description are correct. Barangay personnel still verify every report.
          </Txt>
        </span>
      </p>
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-[14px] leading-snug font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring lg:text-[15px]">
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
