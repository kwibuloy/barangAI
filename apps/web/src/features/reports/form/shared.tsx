import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../../lib/i18n'

/** Pieces the report form's steps share. */
export const EASE = [0.22, 1, 0.36, 1] as const

export function validCoordinates(latitude: string, longitude: string) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return latitude !== '' && longitude !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('hairline rounded-2xl bg-card p-4', className)}>{children}</div>
}

/** Marks a field the AI filled in from the photo; it disappears once the resident edits that field. */
export function AiTag({ check = false }: { check?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold',
        check
          ? 'bg-[color-mix(in_oklab,var(--status-pending)_14%,transparent)] text-[var(--status-pending)]'
          : 'bg-tint text-link',
      )}
    >
      <Sparkles className="size-3" aria-hidden="true" />
      <Txt>{check ? 'AI unsure · please check' : 'Filled by AI · you can edit'}</Txt>
    </span>
  )
}

export type PreviewState = 'checking' | 'analysing' | 'ready' | 'failed'

/** Shows the server's face-blurred copy. Until then, only a heavily blurred version of the original is visible. */
export function ProtectedPhoto({
  src,
  state,
  className,
  thumb = false,
}: {
  src: string
  state: PreviewState
  className?: string
  thumb?: boolean
}) {
  const t = useText()
  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      {/* A new element for each source: one <img> keeps painting its old picture until the next has loaded. */}
      <img
        key={src}
        className={cn('size-full object-cover', state !== 'ready' && 'scale-110 blur-2xl')}
        src={src}
        alt={t('Preview of incident photo')}
      />
      {state !== 'ready' && !thumb && (
        <div
          className="absolute inset-0 grid place-items-center bg-black/25 p-3 text-center text-[14px] font-medium text-white"
          role="status"
        >
          {state !== 'failed' && <span className="photo-scan" aria-hidden="true" />}
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1">
            {state === 'analysing' && <Sparkles className="size-4 shrink-0" aria-hidden="true" />}
            <Txt>
              {state === 'checking'
                ? 'Hiding faces and plates…'
                : state === 'analysing'
                  ? 'Checking the photo…'
                  : 'Preview hidden. Faces and plates are still checked before saving.'}
            </Txt>
          </span>
        </div>
      )}
    </div>
  )
}
