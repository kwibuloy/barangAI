import { Suspense, type CSSProperties } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ArrowLeft, Bell, FileText, Gift, Inbox, LayoutGrid, LifeBuoy, Map as MapIcon, Users } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BrandMark, Wordmark } from '@/components/BrandMark'
import { PageSpinner } from '@/components/page'
import { navIconStyle, navItemClass } from '@/components/nav'
import { useIsMobile } from '@/hooks/use-mobile'
import { useKeyboardMark } from '@/hooks/use-keyboard-mark'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { AccountIdentity, AccountMenu } from '../account/AccountMenu'
import { AccountButton } from '../account/AccountSettings'
import type { User } from '../auth/queries'
import { useLiveRefresh, useNotifications } from '../notifications/NotificationsPage'
import { groupCases } from '../reports/grouping'
import { useReports } from '../reports/queries'
import { queueLink, WAITING, WORKING } from './queueFilter'

const NAV = [
  { to: '/desk', label: 'Overview', icon: LayoutGrid, color: '#ff9600' },
  { to: '/desk/map', label: 'Map', icon: MapIcon, color: '#ce82ff' },
  { to: '/desk/updates', label: 'Updates', icon: Bell, color: '#ffc800' },
  { to: '/desk/reports', label: 'Reports', icon: Inbox, color: '#1cb0f6' },
  { to: '/desk/rewards', label: 'Rewards', icon: Gift, color: '#58cc02' },
  { to: '/desk/records', label: 'Monthly report', icon: FileText, color: '#ff4b4b' },
  { to: '/desk/accounts', label: 'Staff accounts', icon: Users, color: '#ce82ff' },
  { to: '/desk/help', label: 'Help', icon: LifeBuoy, color: '#1cb0f6' },
]
const SECTIONS = [
  { label: 'Dashboard', items: NAV.slice(0, 3) },
  { label: 'Records', items: NAV.slice(3, 6) },
  { label: 'Support', items: NAV.slice(6) },
]
// Five tabs fit a phone; these are for the office, and Overview links to them on a phone.
const NOT_TABS = ['/desk/records', '/desk/accounts', '/desk/help']
// Hidden when the sidebar collapses to icons.
const WIDE_ONLY = 'group-data-[collapsible=icon]:hidden'

/** Phones: the sections stay one tap away at the bottom, styled like the resident tab bar. */
function StaffTabBar({ current, unread, waiting }: { current: string; unread: number; waiting: number }) {
  const t = useText()
  return (
    <nav
      aria-label={t('Staff sections')}
      className="tab-bar pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 bg-background"
    >
      <ul className="mx-auto flex h-[var(--tabbar)] max-w-2xl items-stretch gap-1 px-2">
        {NAV.filter(item => !NOT_TABS.includes(item.to)).map(item => {
          const active = current === item.to
          const badge = item.to === '/desk/updates' ? unread : item.to === '/desk/reports' ? waiting : 0
          return (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/desk'}
                className="flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold"
              >
                <span
                  className={cn(
                    'relative grid h-10 w-14 place-items-center rounded-xl border-2 transition-colors',
                    active ? 'border-[#84d8ff] bg-sky-soft dark:border-[#3f8db5]' : 'border-transparent',
                  )}
                >
                  <item.icon
                    className="size-[26px]"
                    strokeWidth={2.4}
                    style={navIconStyle(item.color)}
                    aria-hidden="true"
                  />
                  {badge > 0 && (
                    <span
                      aria-label={`${badge} ${t(item.to === '/desk/updates' ? 'unread' : 'waiting for review')}`}
                      className="absolute -top-2 -right-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-background bg-[var(--destructive-edge)] px-1 text-[11px] leading-none font-extrabold text-white"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className={cn('max-w-full truncate', active ? 'text-link' : 'text-muted-foreground')}>
                  <Txt>{item.label}</Txt>
                </span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Desktop-first staff and admin desk: a Duolingo-style sidebar beside the page, live counts one click away.
    On phones: bottom tabs and a top bar with back and account buttons. */
export function StaffShell({ user }: { user: User }) {
  const t = useText()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const phone = useIsMobile()
  useKeyboardMark()
  useLiveRefresh()
  const reports = useReports()
  // Counted as the queue lists them, so a number always equals the list it opens: a grouped case is one row.
  const rows = groupCases(reports.data ?? []).rows
  const count = (...statuses: string[]) => rows.filter(report => statuses.includes(report.status)).length
  const waiting = count(...WAITING)
  const notices = useNotifications()
  // A notifications hiccup must never take the dashboard down with it.
  const unread = Array.isArray(notices.data)
    ? notices.data.filter(item => item.kind !== 'status' && !item.read_at).length
    : 0
  const current = [...NAV].reverse().find(item => pathname.startsWith(item.to)) ?? NAV[0]
  // These two size themselves to fit between the top bar and the tabs.
  const fullHeight = current.to === '/desk/map' || current.to === '/desk/reports'
  function back() {
    // A link opened directly has no history to return to, so go up instead.
    if ((window.history.state?.idx ?? 0) > 0) void navigate(-1)
    else void navigate(pathname === current.to ? '/desk' : current.to)
  }
  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider style={{ '--sidebar-width': '17rem', '--sidebar-width-icon': '5rem' } as CSSProperties}>
        <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-2">
          <SidebarHeader className="px-5 pt-7 pb-3 group-data-[collapsible=icon]:px-3">
            <Link to="/desk" aria-label={t('BarangAI overview')} className="rounded-xl">
              <span className={WIDE_ONLY}>
                <Wordmark />
              </span>
              <span className="hidden group-data-[collapsible=icon]:block">
                <BrandMark size={44} className="mx-auto" />
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="scroll-thin gap-1 px-1">
            {SECTIONS.map(section => (
              <SidebarGroup key={section.label} className="py-1">
                <SidebarGroupLabel className="label-caps px-3 text-[11px] text-muted-foreground">
                  <Txt>{section.label}</Txt>
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1.5">
                    {section.items
                      .filter(item => item.to !== '/desk/accounts' || user.role === 'administrator')
                      .map(item => (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={current.to === item.to}
                            tooltip={t(item.label)}
                            className={cn(
                              navItemClass(current.to === item.to),
                              'h-12 p-3 hover:bg-muted data-active:bg-sky-soft data-active:font-extrabold data-active:text-link group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-2.5! [&>svg]:size-7!',
                            )}
                          >
                            <NavLink to={item.to} end={item.to === '/desk'}>
                              <item.icon
                                strokeWidth={2.3}
                                style={navIconStyle(item.color)}
                                className="transition-transform duration-200 group-hover/nav:-rotate-6 group-hover/nav:scale-110"
                              />
                              <span>
                                <Txt>{item.label}</Txt>
                              </span>
                            </NavLink>
                          </SidebarMenuButton>
                          {item.to === '/desk/updates' && unread > 0 && (
                            <SidebarMenuBadge
                              aria-label={`${unread} ${t('unread')}`}
                              className="top-1/2 right-3 h-6 min-w-6 -translate-y-1/2 rounded-full bg-sky text-[12px] font-extrabold text-white dark:text-[#131f24]"
                            >
                              {unread}
                            </SidebarMenuBadge>
                          )}
                          {item.to === '/desk/reports' && waiting > 0 && (
                            <SidebarMenuBadge
                              aria-label={`${waiting} ${t('waiting for review')}`}
                              className="top-1/2 right-3 h-6 min-w-6 -translate-y-1/2 rounded-full bg-destructive text-[12px] font-extrabold text-white dark:text-[#131f24]"
                            >
                              {waiting}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuItem>
                      ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
            {/* Live counts: the same numbers as the Overview tiles, so they show on every page but that one. */}
            {current.to !== '/desk' && (
              <div className={cn('space-y-1.5 px-3 pt-3', WIDE_ONLY)}>
                {[
                  {
                    label: 'Waiting',
                    value: waiting,
                    color: 'var(--status-pending)',
                    to: queueLink(WAITING),
                  },
                  {
                    label: 'Working',
                    value: count(...WORKING),
                    color: 'var(--status-progress)',
                    to: queueLink(WORKING),
                  },
                  {
                    label: 'Resolved',
                    value: count('Resolved'),
                    color: 'var(--status-resolved)',
                    to: queueLink(['Resolved']),
                  },
                ].map(stat => (
                  // One row each, so a longer translation (Naghihintay, Ginagawa) never overflows a narrow tile.
                  <Link
                    key={stat.label}
                    to={stat.to}
                    className="edge flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  >
                    <span className="min-w-0 text-[13px] font-bold text-muted-foreground">
                      <Txt>{stat.label}</Txt>
                    </span>
                    <strong className="text-[20px] leading-tight tabular-nums" style={{ color: stat.color }}>
                      {stat.value}
                    </strong>
                  </Link>
                ))}
              </div>
            )}
          </SidebarContent>
          <SidebarFooter className="gap-3 p-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <AccountMenu
                  trigger={
                    <SidebarMenuButton
                      size="lg"
                      aria-label={t('Account and settings')}
                      className="rounded-xl border-2 border-transparent hover:border-border hover:bg-muted"
                    >
                      <AccountIdentity user={user} />
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header
            className={cn(
              'sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b-2 bg-background px-5',
              phone && 'top-[env(safe-area-inset-top)] mt-[env(safe-area-inset-top)] h-14 gap-2 px-2',
            )}
          >
            {phone ? (
              pathname !== '/desk' && (
                <button
                  type="button"
                  onClick={back}
                  aria-label={t('Back')}
                  className="grid size-11 shrink-0 place-items-center rounded-full"
                >
                  <ArrowLeft className="size-5" strokeWidth={2.6} aria-hidden="true" />
                </button>
              )
            ) : (
              <SidebarTrigger aria-label={t('Toggle sidebar')} />
            )}
            <current.icon
              className={cn('size-6 shrink-0', phone && pathname === '/desk' && 'ml-2')}
              strokeWidth={2.3}
              style={navIconStyle(current.color)}
              aria-hidden="true"
            />
            <span className="label-caps min-w-0 truncate text-[14px] text-muted-foreground">
              <Txt>{current.label}</Txt>
            </span>
            {user.role === 'administrator' && !phone && (
              <span className="ml-auto rounded-lg border-2 border-[#ce82ff]/50 bg-[#ce82ff]/12 px-2.5 py-1 label-caps text-[11px] text-[#8a3fd1] dark:text-[#dcb1ff]">
                <Txt>Administrator</Txt>
              </span>
            )}
            {phone && (
              <div className="ml-auto">
                <AccountButton user={user} />
              </div>
            )}
          </header>
          <div
            className={cn(
              'min-w-0 flex-1',
              phone && !fullHeight && 'pb-[calc(var(--tabbar)+env(safe-area-inset-bottom)+12px)]',
            )}
          >
            <Suspense fallback={<PageSpinner />}>
              <Outlet />
            </Suspense>
          </div>
        </SidebarInset>
        {phone && <StaffTabBar current={current.to} unread={unread} waiting={waiting} />}
      </SidebarProvider>
    </TooltipProvider>
  )
}
