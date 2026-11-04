import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Bell, ChevronRight, CircleCheckBig, ClipboardList, Gift, Map as MapIcon, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kap } from '@/components/Kap'
import { Scene } from '@/components/Scene'
import { DateText } from '@/components/DateText'
import { Group, LargeTitle, LinkRow, Row, Segmented } from '@/components/page'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'
import { useTilt } from '@/hooks/use-tilt'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { useNotifications, type Notice } from '../notifications/NotificationsPage'
import { label } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { Journey } from '../reports/Journey'
import { useReports } from '../reports/queries'
import { StatusBadge, StatusLine } from '../reports/StatusBadge'
import type { Report } from '../reports/types'

const CLOSED = ['Resolved', 'Rejected']
// Home fits one screen: three rows per list, everything else one tap away under "See all".
const ROWS = 3
const rise = (index: number) => ({ '--i': index }) as CSSProperties

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function SeeAll({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center gap-0.5 rounded-lg px-1 label-caps text-[13px] text-link hover:underline"
    >
      <Txt>See all</Txt>
      <ChevronRight className="size-4" strokeWidth={3} />
    </Link>
  )
}

function OpenRows({ reports, rows = ROWS }: { reports: Report[]; rows?: number }) {
  return reports.length === 0 ? (
    <Row
      leading={<ClipboardList className="size-5 text-muted-foreground" />}
      title={<Txt>Nothing open right now</Txt>}
      subtitle={<Txt>Reports you send will show up here.</Txt>}
    />
  ) : (
    reports
      .slice(0, rows)
      .map(report => (
        <LinkRow
          key={report.id}
          to={`/reports/${report.id}`}
          leading={<CategoryTile category={report.resident_category} />}
          title={<Txt>{label(report.resident_category)}</Txt>}
          subtitle={<StatusLine status={report.status} date={report.created_at} />}
        />
      ))
  )
}

function UpdateRows({ notices, byId }: { notices: Notice[]; byId: Map<string, Report> }) {
  if (notices.length === 0)
    return (
      <Row
        leading={<ClipboardList className="size-5 text-muted-foreground" />}
        title={<Txt>No updates yet.</Txt>}
        subtitle={<Txt>We will tell you here when your reports move.</Txt>}
      />
    )
  return notices.slice(0, ROWS).map(notice => {
    const report = byId.get(notice.report_id)
    return (
      <LinkRow
        key={notice.id}
        to={report ? `/reports/${notice.report_id}` : '/updates'}
        leading={
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${notice.read_at ? 'bg-transparent' : 'bg-sky'}`}
          />
        }
        title={report ? <Txt>{label(report.resident_category)}</Txt> : <Txt>Report update</Txt>}
        subtitle={<StatusLine status={notice.status} date={notice.created_at} />}
      />
    )
  })
}

/** The welcome as a little storybook scene (Report itself lives in the tab bar or sidebar, so it isn't repeated here): Kap on the barangay's hills, leaning with the pointer. */
function Hero({ compact }: { compact?: boolean }) {
  const tilt = useTilt()
  return (
    <section
      {...tilt}
      className={cn(
        'tilt rise relative isolate overflow-hidden rounded-3xl border-2 border-b-[6px] border-[#a5ed6e] bg-leaf-soft dark:border-[#3f6b1f]',
        compact ? 'mb-5 min-h-[156px] p-5 pr-32' : 'mb-8 min-h-[300px] p-9 pr-[250px] pb-12 xl:pr-[290px]',
      )}
    >
      <Scene houses={!compact} />
      <div className="relative" data-depth style={{ '--depth': 0.1 } as CSSProperties}>
        <p className="label-caps text-[13px] text-leaf-ink">
          <Txt>Your barangay, better together</Txt>
        </p>
        <h2 className={cn('display mt-2 text-foreground', compact ? 'text-[25px]' : 'text-[34px] xl:text-[38px]')}>
          <Txt>Spotted a problem nearby?</Txt>
        </h2>
        <p className={cn('mt-3 max-w-md font-bold text-foreground/80', compact ? 'text-[15px]' : 'text-[18px]')}>
          <Txt>Snap a photo and pin the spot. Your barangay takes it from there.</Txt>
        </p>
      </div>
      <div
        data-depth
        style={{ '--depth': 1.3 } as CSSProperties}
        className={cn('absolute', compact ? 'right-1 bottom-2' : 'right-6 bottom-6 xl:right-9')}
      >
        <Kap pose="wave" motion="greet" interactive className={compact ? 'h-32' : 'h-[220px] xl:h-[244px]'} />
      </div>
    </section>
  )
}

/** The newest open report on its journey from Pending to Resolved. */
function LatestJourney({ report, compact }: { report?: Report; compact?: boolean }) {
  if (!report)
    return (
      <section
        className={cn('rise flex items-center rounded-3xl border-2', compact ? 'mb-5 gap-3 p-4' : 'mb-8 gap-5 p-6')}
        style={rise(1)}
      >
        <Kap pose="idea" motion="float" className={cn('shrink-0', compact ? 'h-24' : 'h-28')} />
        <div>
          <h2 className="text-[20px] leading-tight">
            <Txt>No open reports</Txt>
          </h2>
          <p className="mt-1 text-[16px] text-muted-foreground">
            <Txt>When you send one, you can follow every step of its journey here.</Txt>
          </p>
        </div>
      </section>
    )
  return (
    <section className={cn('rise rounded-3xl border-2', compact ? 'mb-5 p-4 pb-5' : 'mb-8 p-6 pb-7')} style={rise(1)}>
      <div className={cn('flex items-start', compact ? 'gap-3' : 'gap-4')}>
        <CategoryTile category={report.resident_category} size={compact ? undefined : 'lg'} />
        <div className="min-w-0 flex-1">
          <p className="label-caps text-[12px] text-muted-foreground">
            <Txt>Your latest report</Txt>
          </p>
          <h2 className={cn('mt-0.5 truncate leading-tight', compact ? 'text-[19px]' : 'text-[22px]')}>
            <Txt>{label(report.resident_category)}</Txt>
          </h2>
          <p className="mt-1 truncate text-[15px] text-muted-foreground">
            {report.location_label ? `${report.location_label} · ` : ''}
            {report.created_at && <DateText value={report.created_at} compact />}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/reports/${report.id}`}>
            <Txt>{compact ? 'View' : 'View report'}</Txt>
          </Link>
        </Button>
      </div>
      <Journey status={report.status} compact={compact} className={compact ? 'mt-12' : 'mt-14'} />
    </section>
  )
}

function StatTile({
  to,
  value,
  label: text,
  icon: Icon,
  color,
}: {
  to: string
  value: number
  label: string
  icon: typeof Bell
  color: string
}) {
  return (
    <Link to={to} className="edge flex flex-col items-center rounded-2xl px-2 pt-3 pb-2.5 text-center">
      <Icon
        className="size-7"
        style={{ color, fill: `color-mix(in oklab, ${color} 22%, transparent)` }}
        strokeWidth={2.4}
        aria-hidden="true"
      />
      <strong className="mt-1 text-[24px] leading-none tabular-nums">{value}</strong>
      <span className="mt-1 text-[13px] font-bold text-muted-foreground">
        <Txt>{text}</Txt>
      </span>
    </Link>
  )
}

function RailCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] leading-tight">
          <Txt>{title}</Txt>
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Desktop right rail, like Duolingo's: numbers at a glance, the latest updates, then the map and emergency help. */
function Rail({
  active,
  resolved,
  unread,
  notices,
  byId,
}: {
  active: number
  resolved: number
  unread: number
  notices: Notice[]
  byId: Map<string, Report>
}) {
  const t = useText()
  return (
    <aside className="space-y-6 lg:sticky lg:top-8">
      <div className="rise grid grid-cols-3 gap-3" style={rise(0)}>
        <StatTile to="/reports" value={active} label="Open" icon={ClipboardList} color="#1cb0f6" />
        <StatTile to="/reports" value={resolved} label="Resolved" icon={CircleCheckBig} color="#58cc02" />
        <StatTile to="/updates" value={unread} label="Unread" icon={Bell} color="#ffc800" />
      </div>
      <div className="rise" style={rise(1)}>
        <RailCard title="Latest updates" action={<SeeAll to="/updates" />}>
          {notices.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              <Txt>We will tell you here when your reports move.</Txt>
            </p>
          ) : (
            <ul className="-mx-2 space-y-1">
              {notices.slice(0, 4).map(notice => {
                const report = byId.get(notice.report_id)
                return (
                  <li key={notice.id}>
                    <Link
                      to={report ? `/reports/${notice.report_id}` : '/updates'}
                      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span
                        aria-hidden="true"
                        className={cn('size-2.5 shrink-0 rounded-full', notice.read_at ? 'bg-border' : 'bg-sky')}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-extrabold">
                          {report ? <Txt>{label(report.resident_category)}</Txt> : <Txt>Report update</Txt>}
                        </span>
                        <span className="text-[13px] text-muted-foreground">
                          <DateText value={notice.created_at} compact />
                        </span>
                      </span>
                      <StatusBadge status={notice.status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </RailCard>
      </div>
      <a
        href="tel:911"
        className="rise flex items-center gap-4 rounded-2xl border-2 border-b-4 border-[#ffb2b2] bg-cardinal-soft p-4 transition-[translate,border-bottom-width] active:translate-y-0.5 dark:border-[#6b2b31]"
        style={rise(3)}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive text-white shadow-[0_3px_0_var(--destructive-edge)] dark:text-[#131f24]">
          <Phone className="size-5" strokeWidth={2.6} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <strong className="block text-[16px] leading-tight">
            <Txt>Emergency? Call 911</Txt>
          </strong>
          <span className="text-[13.5px] text-foreground/75">
            <Txt>For fires, injuries or danger to life, call first, then report.</Txt>
          </span>
        </span>
      </a>
      <nav
        aria-label={t('Legal')}
        className="flex flex-wrap gap-x-4 gap-y-1 px-1 label-caps text-[12px] text-muted-foreground"
      >
        <Link to="/terms" className="hover:text-foreground">
          <Txt>Terms</Txt>
        </Link>
        <Link to="/privacy" className="hover:text-foreground">
          <Txt>Privacy</Txt>
        </Link>
      </nav>
    </aside>
  )
}

export function HomePage() {
  const t = useText()
  const desktop = useMediaQuery(DESKTOP)
  const reports = useReports()
  const notices = useNotifications()
  const [tab, setTab] = useState<'open' | 'updates'>('open')
  const all = reports.data ?? []
  const active = all.filter(report => !CLOSED.includes(report.status))
  const latest = [...active].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
  const resolved = all.filter(report => report.status === 'Resolved').length
  const byId = new Map(all.map(report => [report.id, report]))
  const items = notices.data ?? []
  const unread = items.filter(item => !item.read_at).length
  const summary = reports.isSuccess
    ? `${active.length} ${t('open')} · ${resolved} ${t('resolved')}`
    : t('Thanks for looking out for your barangay.')

  if (desktop)
    return (
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_340px] items-start gap-10 pt-8 xl:grid-cols-[minmax(0,1fr)_372px] xl:gap-14">
        <div className="min-w-0">
          <header className="rise mb-6">
            <h1 className="display text-[34px]">{t(greeting())}!</h1>
            <p className="mt-1 text-[17px] text-muted-foreground">{summary}</p>
          </header>
          <Hero />
          <LatestJourney report={latest} />
          <div className="rise" style={rise(2)}>
            <Group className="mb-0" title={<Txt>Open reports</Txt>} action={all.length > 0 && <SeeAll to="/reports" />}>
              <OpenRows reports={active} rows={4} />
            </Group>
          </div>
        </div>
        <Rail active={active.length} resolved={resolved} unread={unread} notices={items} byId={byId} />
      </div>
    )

  return (
    <div>
      <LargeTitle title={t(greeting())} subtitle={summary} trailing={<ResidentAccount />} />
      <Hero compact />
      <div className="rise mb-5 grid grid-cols-3 gap-2.5" style={rise(1)}>
        <StatTile to="/reports" value={active.length} label="Open" icon={ClipboardList} color="#1cb0f6" />
        <StatTile to="/reports" value={resolved} label="Resolved" icon={CircleCheckBig} color="#58cc02" />
        <StatTile to="/updates" value={unread} label="Unread" icon={Bell} color="#ffc800" />
      </div>
      <LatestJourney report={latest} compact />
      <div className="mb-3 flex items-center gap-2">
        <Segmented
          id="home-lists"
          label={t('Show')}
          className="flex-1"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: `${t('Open')} · ${active.length}` },
            { value: 'updates', label: unread ? `${t('Updates')} · ${unread}` : t('Updates') },
          ]}
        />
        <SeeAll to={tab === 'open' ? '/reports' : '/updates'} />
      </div>
      <div className="hairline mb-5 overflow-hidden rounded-2xl bg-card">
        {tab === 'open' ? <OpenRows reports={active} /> : <UpdateRows notices={items} byId={byId} />}
      </div>
      <RewardsCard />
      <CommunityCard />
      <EmergencyCard />
    </div>
  )
}

/** Points for valid reports, spent in any barangay's shop (phones; desktops link it from the sidebar). */
function RewardsCard() {
  return (
    <Link to="/rewards" className="edge mb-3 flex items-center gap-3 rounded-2xl p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#ffc800] text-[#4a3a00] shadow-[0_3px_0_#e0a800]">
        <Gift className="size-5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[16px]">
          <Txt>Rewards</Txt>
        </strong>
        <span className="text-[14px] text-muted-foreground">
          <Txt>Earn points for valid reports and spend them in any barangay's shop.</Txt>
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
    </Link>
  )
}

function CommunityCard() {
  return (
    <Link to="/community" className="edge mb-3 flex items-center gap-3 rounded-2xl p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#ce82ff] text-white shadow-[0_3px_0_#a560e8]">
        <MapIcon className="size-5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[16px]">
          <Txt>Community map</Txt>
        </strong>
        <span className="text-[14px] text-muted-foreground">
          <Txt>See what neighbours reported. Seen it too? Add your photo.</Txt>
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
    </Link>
  )
}

function EmergencyCard() {
  return (
    <a
      href="tel:911"
      className="flex items-center gap-3 rounded-2xl border-2 border-b-4 border-[#ffb2b2] bg-cardinal-soft p-4 transition-[translate,border-bottom-width] active:translate-y-0.5 active:border-b-2 dark:border-[#6b2b31]"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-destructive text-white shadow-[0_3px_0_var(--destructive-edge)] dark:text-[#131f24]">
        <Phone className="size-5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[16px]">
          <Txt>Emergency? Call 911</Txt>
        </strong>
        <span className="text-[13.5px] font-bold text-foreground/75">
          <Txt>For fires, injuries or danger to life, call first, then report.</Txt>
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
    </a>
  )
}
