import { createContext, lazy, Suspense, useContext, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { m } from 'motion/react'
import { Bell, ClipboardList, Gift, House, LifeBuoy, Map as MapIcon, SquarePen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navIconStyle } from '@/components/nav'
import { Txt, useText } from '../lib/i18n'
import type { User } from '../features/auth/queries'
import { AccountButton } from '../features/account/AccountSettings'
import { useLiveRefresh, useNotifications } from '../features/notifications/NotificationsPage'
import { PageSpinner } from '@/components/page'
import { OfflineStrip } from '@/components/OfflineStrip'
import { DemoChip } from '@/components/DemoChip'
import { keepOnlyDraftsOf } from '../features/reports/draft'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'
import { useKeyboardMark } from '@/hooks/use-keyboard-mark'
import { glassesAvailable } from '../features/glasses/connection'

// Desktop only (1024px and up): phones never download the sidebar or its account menu.
const SideBar = lazy(() => import('./ResidentSidebar').then(module => ({ default: module.SideBar })))
// Android app only: the website never downloads the Rokid Glasses code.
const GlassesLink = lazy(() => import('../features/glasses/Glasses').then(module => ({ default: module.GlassesLink })))

export const TABS = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/report', label: 'Report', icon: SquarePen },
  { to: '/reports', label: 'My reports', icon: ClipboardList },
  { to: '/updates', label: 'Updates', icon: Bell },
  { to: '/help', label: 'Help', icon: LifeBuoy },
]
// Not a tab (five is the most a phone tab bar holds): phones reach it from Home, desktops from the sidebar.
export const COMMUNITY = { to: '/community', label: 'Community map', icon: MapIcon }
// Also not a tab: phones open it from Home's Rewards card.
export const REWARDS = { to: '/rewards', label: 'Rewards', icon: Gift }
/** Each section's icon colour in the desktop sidebar, from the Duolingo illustration palette. */
export const NAV_COLOR: Record<string, string> = {
  '/home': '#ff9600',
  '/report': '#58cc02',
  '/reports': '#1cb0f6',
  '/community': '#ce82ff',
  '/updates': '#ffc800',
  '/help': '#ff4b4b',
  '/rewards': '#58cc02',
}

// The tab bar puts Report in the centre, the thumb's easiest reach; the desktop sidebar keeps TABS order.
const PHONE_TABS = [TABS[0], TABS[2], TABS[1], TABS[3], TABS[4]]

const UserContext = createContext<User | null>(null)
/** The signed-in resident, for greetings. */
export const useResident = () => useContext(UserContext)!

/** Avatar for the right of each resident large title (phones and tablets; desktops use the sidebar). */
export function ResidentAccount() {
  const user = useResident()
  return useMediaQuery(DESKTOP) ? null : (
    <span className="flex items-center gap-2">
      <DemoChip />
      <AccountButton user={user} />
    </span>
  )
}

function TabBar() {
  const t = useText()
  const unread = useUnread()
  return (
    <nav
      aria-label={t('Resident sections')}
      className="tab-bar pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 bg-background lg:hidden md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[min(560px,calc(100%-48px))] md:-translate-x-1/2 md:rounded-3xl md:border-2 md:border-b-4 md:pb-0"
    >
      <ul className="mx-auto flex h-[var(--tabbar)] max-w-2xl items-stretch gap-1 px-2">
        {PHONE_TABS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to !== '/reports'}
              className="group/tab flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold"
            >
              {({ isActive }) =>
                to === '/report' ? (
                  // The main action: the same size as the other tabs (a raised button overlapped the bars above
                  // it), set apart by its green fill and a lip that sinks on press.
                  <>
                    <span className="grid h-10 w-14 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-edge)] transition-[translate,box-shadow] duration-100 group-active/tab:translate-y-[3px] group-active/tab:shadow-[0_0_0_var(--primary-edge)]">
                      <Icon className="size-[24px]" strokeWidth={2.6} aria-hidden="true" />
                    </span>
                    <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}>
                      <Txt>{label}</Txt>
                    </span>
                  </>
                ) : (
                  <>
                    <m.span
                      className={cn(
                        'relative grid h-10 w-14 place-items-center rounded-xl border-2 transition-colors',
                        isActive ? 'border-[#84d8ff] bg-sky-soft dark:border-[#3f8db5]' : 'border-transparent',
                      )}
                      animate={{ scale: isActive ? 1 : 0.94 }}
                      whileTap={{ scale: 0.86 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                    >
                      <Icon
                        className="size-[26px]"
                        strokeWidth={2.4}
                        style={navIconStyle(NAV_COLOR[to])}
                        aria-hidden="true"
                      />
                      {to === '/updates' && unread > 0 && (
                        <m.span
                          key={unread}
                          initial={{ scale: 0.4 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                          aria-label={`${unread} ${t('unread')}`}
                          className="absolute -top-2 -right-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-background bg-[var(--destructive-edge)] px-1 text-[11px] leading-none font-extrabold text-white"
                        >
                          {unread > 99 ? '99+' : unread}
                        </m.span>
                      )}
                    </m.span>
                    <span className={isActive ? 'text-link' : 'text-muted-foreground'}>
                      <Txt>{label}</Txt>
                    </span>
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function useUnread() {
  const notices = useNotifications()
  return (notices.data ?? []).filter(item => !item.read_at).length
}

/** Phone-first resident app: one column, big friendly titles, a Duolingo-style tab bar with Report raised in the middle
    (a floating card on tablets, a sidebar on desktops). */
export function ResidentShell({ user }: { user: User }) {
  const desktop = useMediaQuery(DESKTOP)
  useKeyboardMark()
  useLiveRefresh()
  useEffect(() => {
    void keepOnlyDraftsOf(user.id)
  }, [user.id])
  return (
    <UserContext.Provider value={user}>
      <OfflineStrip />
      <div className="resident-shell min-h-dvh">
        {desktop && (
          <Suspense fallback={null}>
            <SideBar user={user} />
          </Suspense>
        )}
        {/* Desktop pages pick their own width (lists, split views); phones and tablets keep one centred column. */}
        <main className="mx-auto max-w-2xl px-4 pb-[calc(var(--tab-offset)+12px)] has-data-fit:pb-[var(--tab-offset)] sm:px-6 md:pb-32 lg:ml-[17rem] lg:max-w-none lg:px-10 lg:pb-12 xl:px-14">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
        {!desktop && <TabBar />}
        {glassesAvailable() && (
          <Suspense fallback={null}>
            <GlassesLink />
          </Suspense>
        )}
      </div>
    </UserContext.Provider>
  )
}
