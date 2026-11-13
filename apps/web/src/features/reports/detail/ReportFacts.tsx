// The photo, place, categories, AI hints, notes and history of one report.
import { MapPin, Sparkles, TriangleAlert } from 'lucide-react'
import { DateText } from '@/components/DateText'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../../lib/i18n'
import { hazardLabels, label, rejectionReasons } from '../categories'
import { STATUS_STYLE } from '../StatusBadge'
import type { Report } from '../types'
import { Panel } from './shared'

export function ReportFacts({ detail }: { detail: Report }) {
  const t = useText()
  const history = detail.events ?? [{ to_status: detail.status, created_at: detail.created_at }]
  return (
    <>
      {/* Three separate fields: what the resident chose, what the model guessed, what staff confirmed. */}
      <div className="@container">
        <dl className="hairline grid divide-y rounded-2xl bg-card @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
          {[
            { term: 'Resident category', value: detail.resident_category },
            { term: 'AI suggestion', value: detail.model_category, ai: true },
            { term: 'Verified category', value: detail.verified_category },
          ].map(item => (
            <div key={item.term} className="flex min-w-0 items-baseline justify-between gap-3 p-3 @sm:block">
              <dt className="flex items-center gap-1 text-[12px] leading-tight text-muted-foreground">
                {item.ai && <Sparkles className="size-3 shrink-0" aria-hidden="true" />}
                <Txt>{item.term}</Txt>
              </dt>
              <dd
                className={cn(
                  'text-right text-[15px] leading-snug font-semibold @sm:mt-1 @sm:text-left',
                  !item.value && 'text-muted-foreground',
                )}
              >
                <Txt>{label(item.value)}</Txt>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {detail.hazards && detail.hazards.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          <Txt>The AI noticed:</Txt>
          {detail.hazards.map(hazard => (
            <span
              key={hazard}
              className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--status-progress)_13%,transparent)] px-2 py-0.5 font-medium text-[var(--status-progress)]"
            >
              <TriangleAlert className="size-3" aria-hidden="true" />
              <Txt>{hazardLabels[hazard] ?? hazard}</Txt>
            </span>
          ))}
        </p>
      )}
      {(detail.description || detail.latitude != null) && (
        <Panel>
          {detail.description && <p className="text-[16px]">{detail.description}</p>}
          {detail.latitude != null && detail.longitude != null && (
            <p
              className={cn(
                'flex items-start gap-1.5 text-[14px] text-muted-foreground',
                detail.description && 'mt-3 border-t pt-3',
              )}
            >
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {detail.location_label && (
                  <span className="block font-medium text-foreground">{detail.location_label}</span>
                )}
                <span className="font-mono">
                  {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
                </span>
              </span>
            </p>
          )}
        </Panel>
      )}
      {detail.addenda && detail.addenda.length > 0 && (
        <Panel title="Added later by the resident">
          <ol className="space-y-3">
            {detail.addenda.map(item => (
              <li key={item.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <small className="text-[13px] text-muted-foreground">
                  <DateText value={item.created_at} />
                </small>
                <p className="mt-1 text-[15px] break-words">{item.note}</p>
                {item.image_url && (
                  <img
                    className="hairline mt-2 aspect-[4/3] w-full max-w-sm rounded-xl bg-muted object-cover"
                    src={item.image_url}
                    alt={t('Photo added later')}
                  />
                )}
              </li>
            ))}
          </ol>
        </Panel>
      )}
      <Panel title="Status history">
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
          {history.map((event, index) => {
            const style = event.to_status ? STATUS_STYLE[event.to_status] : undefined
            return (
              <li key={event.id ?? index} className="relative pl-6">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-card"
                  style={{ backgroundColor: style?.color ?? 'var(--muted-foreground)' }}
                />
                <strong className="block text-[15px] font-semibold">
                  <Txt>{event.to_status ?? 'Update'}</Txt>
                </strong>
                <small className="text-[13px] text-muted-foreground">
                  {event.created_at ? <DateText value={event.created_at} /> : t('Recorded')}
                </small>
                {event.rejection_reason && (
                  <p className="mt-1 text-[15px] font-medium">
                    <Txt>
                      {rejectionReasons.find(item => item.value === event.rejection_reason)?.label ?? 'Other reason'}
                    </Txt>
                  </p>
                )}
                {event.note && <p className="mt-1 text-[15px]">{t(event.note)}</p>}
              </li>
            )
          })}
        </ol>
      </Panel>
      {detail.actions && detail.actions.length > 0 && (
        <Panel title="Action log">
          <ol className="space-y-3">
            {detail.actions.map(action => (
              <li key={action.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <strong className="block text-[15px] font-semibold">
                  <Txt>
                    {action.kind === 'coordination'
                      ? 'External coordination'
                      : action.kind === 'system'
                        ? 'Automatic note'
                        : 'Staff action'}
                  </Txt>
                </strong>
                <small className="text-[13px] text-muted-foreground">
                  <DateText value={action.created_at} />
                </small>
                <p className="mt-1 text-[15px]">{action.note}</p>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  )
}

// Keeps "and next" honest about what it does when a report can go two ways.
