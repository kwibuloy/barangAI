import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Bell, Inbox, LayoutGrid, Map as MapIcon } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Wordmark } from '@/components/BrandMark'
import { PageSpinner } from '@/components/page'
import { Kap } from '@/components/Kap'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { AccountIdentity, AccountMenu } from '../account/AccountMenu'
import type { User } from '../auth/queries'
import { useNotifications } from '../notifications/NotificationsPage'
import { useReports } from '../reports/queries'

const NAV = [
  { to: '/desk', label: 'Overview', icon: LayoutGrid },
  { to: '/desk/map', label: 'Map', icon: MapIcon },
  { to: '/desk/updates', label: 'Updates', icon: Bell },
  { to: '/desk/reports', label: 'Reports', icon: Inbox },
]
const SECTIONS = [
  { label: 'Dashboard', items: NAV.slice(0, 3) },
  { label: 'Records', items: NAV.slice(3) },
]
// Hidden when the sidebar collapses to icons.
const WIDE_ONLY = 'group-data-[collapsible=icon]:hidden'

/** Desktop-first staff dashboard: sidebar navigation, content on an inset card. */
export function StaffShell({ user }: { user: User }) {
  const t = useText()
  const { pathname } = useLocation()
  const reports = useReports()
  const all = reports.data ?? []
  const count = (...statuses: string[]) => all.filter(report => statuses.includes(report.status)).length
  const waiting = count('Pending', 'Under Verification')
  const notices = useNotifications()
  // A notifications hiccup must never take the dashboard down with it.
  const unread = Array.isArray(notices.data)
    ? notices.data.filter(item => item.kind !== 'status' && !item.read_at).length
    : 0
  const current = [...NAV].reverse().find(item => pathname.startsWith(item.to)) ?? NAV[0]
  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider>
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-1.5">
            <Wordmark textClassName="truncate group-data-[collapsible=icon]:hidden" />
          </SidebarHeader>
          <SidebarContent className="scroll-thin gap-2">
            <div className={cn('px-3 pt-1 pb-2', WIDE_ONLY)}>
              <Button asChild className="w-full shadow-[0_6px_16px_-8px_rgb(29_100_216/0.6)]">
                <Link to="/desk/reports?status=Pending">
                  <Inbox />
                  <Txt>Open review queue</Txt>
                </Link>
              </Button>
            </div>
            {SECTIONS.map(section => (
              <SidebarGroup key={section.label} className="py-1">
                <SidebarGroupLabel className="text-[12px] font-semibold tracking-wide uppercase">
                  <Txt>{section.label}</Txt>
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {section.items.map(item => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={current.to === item.to}
                          tooltip={t(item.label)}
                          className="h-11 gap-3 rounded-xl px-3 text-[15px] data-[active=true]:bg-card data-[active=true]:text-primary data-[active=true]:shadow-[0_1px_3px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)] [&>svg]:size-5"
                        >
                          <NavLink to={item.to} end={item.to === '/desk'}>
                            <item.icon />
                            <span>
                              <Txt>{item.label}</Txt>
                            </span>
                          </NavLink>
                        </SidebarMenuButton>
                        {item.to === '/desk/updates' && unread > 0 && (
                          <SidebarMenuBadge
                            aria-label={`${unread} ${t('unread')}`}
                            className="top-3 rounded-full bg-primary text-primary-foreground"
                          >
                            {unread}
                          </SidebarMenuBadge>
                        )}
                        {item.to === '/desk/reports' && waiting > 0 && (
                          <SidebarMenuBadge
                            aria-label={`${waiting} ${t('waiting for review')}`}
                            className="top-3 rounded-full bg-destructive text-white"
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
            {/* Live counts: the same numbers as the Overview cards, one click from any page. */}
            <div className={cn('grid grid-cols-3 gap-2 px-3 pt-2', WIDE_ONLY)}>
              {[
                {
                  label: 'Waiting',
                  value: waiting,
                  color: 'var(--status-pending)',
                  to: '/desk/reports?status=Pending',
                },
                {
                  label: 'Working',
                  value: count('Accepted', 'In Progress'),
                  color: 'var(--status-progress)',
                  to: '/desk/reports?status=In+Progress',
                },
                {
                  label: 'Resolved',
                  value: count('Resolved'),
                  color: 'var(--status-resolved)',
                  to: '/desk/reports?status=Resolved',
                },
              ].map(stat => (
                <Link
                  key={stat.label}
                  to={stat.to}
                  className="hairline rounded-xl bg-card px-2.5 py-2 transition-colors hover:bg-accent"
                >
                  <strong
                    className="block text-[20px] leading-tight font-bold tabular-nums"
                    style={{ color: stat.color }}
                  >
                    {stat.value}
                  </strong>
                  <span className="text-[12px] text-muted-foreground">
                    <Txt>{stat.label}</Txt>
                  </span>
                </Link>
              ))}
            </div>
          </SidebarContent>
          <SidebarFooter className="gap-3">
            <Link
              to="/desk/reports?status=Pending"
              className={cn(
                'mx-1 flex items-center gap-3 rounded-2xl bg-tint p-3 pr-4 transition-colors hover:bg-primary/15',
                WIDE_ONLY,
              )}
            >
              <Kap pose="clipboard" className="h-14 w-auto shrink-0" />
              <span className="min-w-0">
                <strong className="block text-[14px] font-semibold">
                  {waiting} <Txt>waiting for review</Txt>
                </strong>
                <span className="text-[13px] text-primary">
                  <Txt>Start reviewing</Txt> →
                </span>
              </span>
            </Link>
            <SidebarMenu>
              <SidebarMenuItem>
                <AccountMenu
                  trigger={
                    <SidebarMenuButton size="lg" aria-label={t('Account and settings')}>
                      <AccountIdentity user={user} />
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" aria-label={t('Toggle sidebar')} />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <span className="text-[15px] font-semibold">
              <Txt>{current.label}</Txt>
            </span>
          </header>
          <div className="min-w-0 flex-1">
            <Suspense fallback={<PageSpinner />}>
              <Outlet />
            </Suspense>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
