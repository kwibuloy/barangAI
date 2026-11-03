import { MapPin, ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import type { Report, TrustFlag } from './types'

const SOURCE: Record<NonNullable<Report['location_source']>, string> = {
  photo: "Pin from the photo's GPS",
  device: "Pin from the phone's GPS",
  manual: 'Pin placed by hand',
}

export function useFlagText() {
  const t = useText()
  return (flag: TrustFlag) => {
    switch (flag.code) {
      case 'pin_far_from_photo':
        return t('The pin is {n} m from where the photo was taken.').replace('{n}', String(flag.detail))
      case 'old_photo':
        return t('The photo was taken {n} days before it was sent.').replace('{n}', String(flag.detail))
      case 'photo_date_ahead':
        return t("The photo's date is {n} days ahead; the camera clock may be wrong.").replace(
          '{n}',
          String(flag.detail),
        )
      case 'no_photo_details':
        return t('The photo has no camera or date details. Common for screenshots, downloads and some phones.')
    }
  }
}

/** Staff queue hint that a report's photo needs a closer look. Outlined like the priority chip: never a status. */
export function TrustChip({ flags, className }: { flags: TrustFlag[]; className?: string }) {
  const text = useFlagText()
  if (flags.length === 0) return null
  return (
    <span
      title={flags.map(text).join(' ')}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full whitespace-nowrap border border-dashed border-[color-mix(in_oklab,var(--status-verifying)_45%,transparent)] px-2 text-[12.5px] font-semibold text-[var(--status-verifying)]',
        className,
      )}
    >
      <ShieldAlert className="size-3.5" aria-hidden="true" />
      <Txt>Check photo</Txt>
    </span>
  )
}

/** Staff only: what the photo's own details say about the pin and date. Signals, never proof either way. */
export function TrustPanel({ report }: { report: Report }) {
  const text = useFlagText()
  const flags = report.trust_flags ?? []
  return (
    <section className="hairline rounded-2xl bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
        {flags.length ? (
          <ShieldAlert className="size-4 text-[var(--status-verifying)]" aria-hidden="true" />
        ) : (
          <ShieldCheck className="size-4 text-[var(--status-resolved)]" aria-hidden="true" />
        )}
        <Txt>Photo checks</Txt>
      </h3>
      {flags.length ? (
        <ul className="space-y-2 text-[14.5px]">
          {flags.map(flag => (
            <li key={flag.code} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--status-verifying)]" />
              {text(flag)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14.5px]">
          <Txt>The photo's date and GPS match the report.</Txt>
        </p>
      )}
      {report.location_source && (
        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-[13.5px] text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden="true" />
          <Txt>{SOURCE[report.location_source]}</Txt>
        </p>
      )}
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        <Txt>Photo details can be edited, so these checks are hints, not proof. Residents do not see them.</Txt>
      </p>
    </section>
  )
}
