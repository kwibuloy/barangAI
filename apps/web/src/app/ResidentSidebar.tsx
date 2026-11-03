import { Link, NavLink } from 'react-router'
import { SquarePen } from 'lucide-react'
import { Wordmark } from '@/components/BrandMark'
import { Kap } from '@/components/Kap'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../lib/i18n'
import type { User } from '../features/auth/queries'
import { AccountIdentity, AccountMenu } from '../features/account/AccountMenu'
import { useReports } from '../features/reports/queries'
import { COMMUNITY, TABS, useUnread } from './ResidentShell'

const SECTIONS = [
  { label: 'Reports', tabs: [...TABS.slice(0, 3), COMMUNITY] },
  { label: 'Support', tabs: TABS.slice(3) },
]

/** Desktop navigation (1024px and up), in place of the tab bar: the main action, grouped links, a live
    summary of the resident's reports, a way to Help, and the account menu. */
export function SideBar({ user }: { user: User }) {
  const t = useText()
  const unread = useUnread()
  const reports = useReports()
  const all = reports.data ?? []
  const open = all.filter(report => !['Resolved', 'Rejected'].includes(report.status)).length
  const resolved = all.filter(report => report.status === 'Resolved').length
  return (
    <aside className="scroll-thin fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col gap-5 overflow-y-auto border-r bg-sidebar px-4 pt-5 pb-4">
      <div className="px-2">
        <Wordmark />
      </div>
      <Button asChild className="w-full shadow-[0_6px_16px_-8px_rgb(29_100_216/0.6)]">
        <Link to="/report">
          <SquarePen />
          <Txt>Report a concern</Txt>
        </Link>
      </Button>
      <nav aria-label={t('Resident sections')} className="space-y-5">
        {SECTIONS.map(section => (
          <div key={section.label}>
            <h2 className="mb-1.5 px-3 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
              <Txt>{section.label}</Txt>
            </h2>
            <ul className="space-y-1">
              {section.tabs.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to !== '/reports'}
                    className={({ isActive }) =>
                      cn(
                        'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
                        isActive
                          ? 'bg-card text-primary shadow-[0_1px_3px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)]'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent',
                      )
                    }
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    <span className="flex-1">
                      <Txt>{label}</Txt>
                    </span>
                    {to === '/updates' && unread > 0 && (
                      <span
                        aria-label={`${unread} ${t('unread')}`}
                        className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white"
                      >
                        {unread}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/reports" className="hairline rounded-xl bg-card px-3 py-2.5 transition-colors hover:bg-accent">
          <strong className="block text-[22px] leading-tight font-bold tabular-nums">{open}</strong>
          <span className="text-[12.5px] text-muted-foreground">
            <Txt>Open</Txt>
          </span>
        </Link>
        <Link to="/reports" className="hairline rounded-xl bg-card px-3 py-2.5 transition-colors hover:bg-accent">
          <strong className="block text-[22px] leading-tight font-bold text-[var(--status-resolved)] tabular-nums">
            {resolved}
          </strong>
          <span className="text-[12.5px] text-muted-foreground">
            <Txt>Resolved</Txt>
          </span>
        </Link>
      </div>
      <div className="mt-auto space-y-3">
        <Link
          to="/help"
          className="flex items-center gap-3 rounded-2xl bg-tint p-3 pr-4 transition-colors hover:bg-primary/15"
        >
          <Kap pose="welcome" className="h-14 w-auto shrink-0" />
          <span className="min-w-0">
            <strong className="block text-[14px] font-semibold">
              <Txt>Need help?</Txt>
            </strong>
            <span className="text-[13px] text-primary">
              <Txt>Ask BarangAI</Txt> →
            </span>
          </span>
        </Link>
        <AccountMenu
          trigger={
            <button
              type="button"
              aria-label={t('Account and settings')}
              className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent"
            >
              <AccountIdentity user={user} />
            </button>
          }
        />
      </div>
    </aside>
  )
}
