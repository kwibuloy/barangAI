import { useState } from 'react'
import { Link } from 'react-router'
import { m } from 'motion/react'
import { ChevronRight, ClipboardList, Map as MapIcon, Phone, SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kap } from '@/components/Kap'
import { Group, LargeTitle, LinkRow, Row, Segmented } from '@/components/page'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'
import { Txt, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { useNotifications, type Notice } from '../notifications/NotificationsPage'
import { label } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { useReports } from '../reports/queries'
import { StatusLine } from '../reports/StatusBadge'
import type { Report } from '../reports/types'

const CLOSED = ['Resolved', 'Rejected']
// Home fits one screen: three rows per list, everything else one tap away under "See all".
const ROWS = 3

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function SeeAll({ to }: { to: string }) {
  return (
    <Link to={to} className="flex min-h-11 items-center text-[15px] font-medium text-primary">
      <Txt>See all</Txt>
      <ChevronRight className="size-4" />
    </Link>
  )
}

function OpenRows({ reports }: { reports: Report[] }) {
  return reports.length === 0 ? (
    <Row
      leading={<ClipboardList className="size-5 text-muted-foreground" />}
      title={<Txt>Nothing open right now</Txt>}
      subtitle={<Txt>Reports you send will show up here.</Txt>}
    />
  ) : (
    reports
      .slice(0, ROWS)
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
            className={`size-2.5 shrink-0 rounded-full ${notice.read_at ? 'bg-transparent' : 'bg-primary'}`}
          />
        }
        title={report ? <Txt>{label(report.resident_category)}</Txt> : <Txt>Report update</Txt>}
        subtitle={<StatusLine status={notice.status} date={notice.created_at} />}
      />
    )
  })
}

export function HomePage() {
  const t = useText()
  const desktop = useMediaQuery(DESKTOP)
  const reports = useReports()
  const notices = useNotifications()
  const [tab, setTab] = useState<'open' | 'updates'>('open')
  const all = reports.data ?? []
  const active = all.filter(report => !CLOSED.includes(report.status))
  const resolved = all.filter(report => report.status === 'Resolved').length
  const byId = new Map(all.map(report => [report.id, report]))
  const items = notices.data ?? []
  const unread = items.filter(item => !item.read_at).length
  return (
    <div className="lg:mx-auto lg:max-w-6xl">
      <LargeTitle
        title={t(greeting())}
        subtitle={
          reports.isSuccess
            ? `${active.length} ${t('open')} · ${resolved} ${t('resolved')}`
            : t('Thanks for looking out for your barangay.')
        }
        trailing={<ResidentAccount />}
      />
      <m.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-4 overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#3b82f6_0%,#1d5fd0_55%,#1a4fb0_100%)] p-4 pr-36 text-white shadow-[0_12px_30px_-12px_rgb(29_100_216/0.55)] sm:p-5 sm:pr-48 lg:mb-6 lg:px-8 lg:py-7 lg:pr-64 xl:mb-7 xl:px-9 xl:py-8 xl:pr-80"
      >
        <h2 className="text-[20px] leading-tight font-bold lg:text-[26px] xl:text-[30px]">
          <Txt>Spotted a problem nearby?</Txt>
        </h2>
        <p className="mt-1.5 text-[14px] text-white/85 lg:mt-2 lg:max-w-md lg:text-[16px] xl:text-[17px]">
          <Txt>Snap a photo and pin the spot. Your barangay takes it from there.</Txt>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 lg:mt-5">
          <Button
            asChild
            className="h-10 bg-white text-[#1d5fd0] hover:bg-white/90 lg:h-12 lg:px-5 lg:text-[16px] xl:h-[52px] xl:px-6 xl:text-[17px]"
          >
            <Link to="/report">
              <SquarePen />
              <Txt>Report a concern</Txt>
            </Link>
          </Button>
          {/* 1024-1279px has no room for the emergency card beside the lists, so it rides in the hero. */}
          <a
            href="tel:911"
            className="hidden h-12 items-center gap-2 rounded-xl bg-white/15 px-4 text-[16px] font-semibold text-white transition-colors hover:bg-white/25 lg:inline-flex xl:hidden"
          >
            <Phone className="size-5" aria-hidden="true" />
            <Txt>Call 911</Txt>
          </a>
        </div>
        <Kap
          pose="thumbs"
          className="absolute right-1 -bottom-3 h-40 w-auto sm:h-48 lg:right-8 lg:h-52 xl:right-12 xl:h-60"
        />
      </m.section>

      {desktop ? (
        <div className="grid grid-cols-2 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
          <Group className="mb-0" title={<Txt>Open reports</Txt>} action={all.length > 0 && <SeeAll to="/reports" />}>
            <OpenRows reports={active} />
          </Group>
          <Group className="mb-0" title={<Txt>Latest updates</Txt>} action={<SeeAll to="/updates" />}>
            <UpdateRows notices={items} byId={byId} />
          </Group>
          <div className="hidden space-y-4 pt-12 xl:block">
            <div className="grid grid-cols-2 gap-3">
              <Link to="/reports" className="hairline rounded-2xl bg-card p-4 transition-colors hover:bg-accent">
                <span className="text-[28px] leading-none font-bold tabular-nums">{active.length}</span>
                <span className="mt-1.5 block text-[14px] text-muted-foreground">
                  <Txt>Open</Txt>
                </span>
              </Link>
              <Link to="/reports" className="hairline rounded-2xl bg-card p-4 transition-colors hover:bg-accent">
                <span className="text-[28px] leading-none font-bold text-[var(--status-resolved)] tabular-nums">
                  {resolved}
                </span>
                <span className="mt-1.5 block text-[14px] text-muted-foreground">
                  <Txt>Resolved</Txt>
                </span>
              </Link>
            </div>
            <EmergencyCard />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
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
          <CommunityCard />
          <EmergencyCard />
        </>
      )}
    </div>
  )
}

function CommunityCard() {
  return (
    <Link
      to="/community"
      className="hairline mb-3 flex items-center gap-3 rounded-2xl bg-card p-3.5 transition-colors active:bg-accent"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground">
        <MapIcon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[16px] font-semibold">
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
      className="hairline flex items-center gap-3 rounded-2xl bg-card p-3.5 transition-colors active:bg-accent lg:p-4"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-destructive text-white">
        <Phone className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[16px] font-semibold">
          <Txt>Emergency? Call 911</Txt>
        </strong>
        <span className="hidden text-[14px] text-muted-foreground lg:block">
          <Txt>For fires, injuries or danger to life, call first, then report.</Txt>
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground/70 lg:hidden" aria-hidden="true" />
    </a>
  )
}
