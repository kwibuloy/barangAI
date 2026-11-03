import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, MapPin, ShieldCheck, TriangleAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateText } from '@/components/DateText'
import { Alert, EmptyState, LargeTitle, Segmented } from '@/components/page'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { hazardLabels, label } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { useCommunityCases } from '../reports/queries'
import { StatusBadge } from '../reports/StatusBadge'
import type { CommunityCase } from '../reports/types'
import { StaffMap } from '../staff/StaffMap'

type Filter = 'open' | 'resolved'

/** Issues the barangay has accepted, on one shared map. No photos, descriptions or names are ever shown. */
export function CommunityPage() {
  const t = useText()
  const cases = useCommunityCases()
  const [filter, setFilter] = useState<Filter>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const shown = useMemo(
    () => (cases.data ?? []).filter(item => (filter === 'resolved') === (item.status === 'Resolved')),
    [cases.data, filter],
  )
  // Map pins share the staff map; it reads a pin's category from resident_category.
  const pins = useMemo(() => shown.map(item => ({ ...item, resident_category: item.category })), [shown])
  const selected = shown.find(item => item.id === selectedId)
  return (
    <div className="lg:mx-auto lg:max-w-6xl">
      <LargeTitle
        title={t('Community map')}
        subtitle={t('Issues your barangay has accepted, and how many residents reported each.')}
        trailing={<ResidentAccount />}
      />
      {cases.error && (
        <Alert className="mb-4">
          <Txt>{cases.error.message}</Txt>
        </Alert>
      )}
      <Segmented<Filter>
        id="community-filter"
        label={t('Show issues')}
        className="mb-4"
        value={filter}
        onChange={value => {
          setFilter(value)
          setSelectedId(null)
        }}
        options={[
          { value: 'open', label: t('Being fixed') },
          { value: 'resolved', label: t('Resolved') },
        ]}
      />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="hairline mb-4 overflow-hidden rounded-2xl bg-card lg:sticky lg:top-6">
          <StaffMap
            reports={pins}
            onSelect={pin => setSelectedId(pin.id)}
            className="h-[42svh] min-h-60 lg:h-[calc(100dvh-14rem)]"
          />
        </div>
        <div>
          {selected && <CaseCard item={selected} />}
          {cases.isSuccess && shown.length === 0 ? (
            <EmptyState
              pose="clipboard"
              title={t(filter === 'open' ? 'No open issues on the map' : 'No resolved issues yet')}
              body={t('Accepted reports appear here once barangay staff have checked them.')}
            />
          ) : (
            <ul className="hairline overflow-hidden rounded-2xl bg-card">
              {shown.map(item => (
                <li key={item.id} className="[&+&]:border-t">
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={item.id === selectedId}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-accent/60',
                      item.id === selectedId && 'bg-tint hover:bg-tint',
                    )}
                  >
                    <CategoryTile category={item.category} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[16px] font-medium">
                        <Txt>{label(item.category)}</Txt>
                      </strong>
                      <span className="mt-0.5 block truncate text-[13.5px] text-muted-foreground">
                        {item.location_label ?? <DateText value={item.last_reported_on} dateOnly />}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground">
                      <Users className="size-3.5" aria-hidden="true" />
                      {item.contributors}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-1.5 px-1 text-[13px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <Txt>Photos, descriptions and names are never shown here. Pins are approximate.</Txt>
          </p>
        </div>
      </div>
    </div>
  )
}

function CaseCard({ item }: { item: CommunityCase }) {
  const t = useText()
  return (
    <section aria-label={t('Selected issue')} className="hairline mb-4 space-y-3 rounded-2xl bg-card p-4">
      <div className="flex items-start gap-3">
        <CategoryTile category={item.category} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] leading-tight font-bold">
            <Txt>{label(item.category)}</Txt>
          </h2>
          <StatusBadge status={item.status} className="mt-1.5" />
        </div>
      </div>
      {item.location_label && (
        <p className="flex items-start gap-1.5 text-[14.5px]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {item.location_label}
        </p>
      )}
      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="text-muted-foreground">
            <Txt>Residents</Txt>
          </dt>
          <dd className="text-[17px] font-semibold tabular-nums">{item.contributors}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Txt>First reported</Txt>
          </dt>
          <dd className="font-medium">
            <DateText value={item.first_reported_on} dateOnly />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Txt>Latest report</Txt>
          </dt>
          <dd className="font-medium">
            <DateText value={item.last_reported_on} dateOnly />
          </dd>
        </div>
      </dl>
      {item.hazards.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {item.hazards.map(hazard => (
            <span
              key={hazard}
              className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--status-progress)_13%,transparent)] px-2 py-0.5 text-[13px] font-medium text-[var(--status-progress)]"
            >
              <TriangleAlert className="size-3" aria-hidden="true" />
              <Txt>{hazardLabels[hazard] ?? hazard}</Txt>
            </span>
          ))}
        </p>
      )}
      {item.contributed ? (
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--status-resolved)]">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <Txt>You reported this issue.</Txt>
        </p>
      ) : (
        item.open_for_evidence && (
          <Button asChild className="w-full">
            <Link to={`/report?case=${item.id}`}>
              <Users />
              <Txt>I see this too</Txt>
            </Link>
          </Button>
        )
      )}
    </section>
  )
}
