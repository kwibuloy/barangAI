import { Camera, Check } from 'lucide-react'
import { Kap } from '@/components/Kap'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../../lib/i18n'
import { label } from '../categories'
import { CategoryTile } from '../CategoryIcon'
import type { Category } from '../types'
import { ProtectedPhoto, type PreviewState } from './shared'

/** Desktop only: what the resident has filled in so far, with a jump back to any finished step. */
export function Summary({
  step,
  preview,
  previewState,
  location,
  category,
  description,
  onEdit,
}: {
  step: number
  preview: string
  previewState: PreviewState
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
          <ProtectedPhoto src={preview} state={previewState} className="aspect-[2/1]" />
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
                  className="text-[14px] font-medium text-link hover:underline"
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
