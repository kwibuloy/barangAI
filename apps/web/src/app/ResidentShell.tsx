import { createContext, lazy, Suspense, useContext } from 'react'
import { NavLink, Outlet } from 'react-router'
import { m } from 'motion/react'
import { Bell, ClipboardList, House, LifeBuoy, Map as MapIcon, SquarePen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../lib/i18n'
import type { User } from '../features/auth/queries'
import { AccountButton } from '../features/account/AccountSettings'
import { useNotifications } from '../features/notifications/NotificationsPage'
import { PageSpinner } from '@/components/page'
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query'

// Desktop only (1024px and up): phones never download the sidebar or its account menu.
const SideBar = lazy(() => import('./ResidentSidebar').then(module => ({ default: module.SideBar })))

export const TABS = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/report', label: 'Report', icon: SquarePen },
  { to: '/reports', label: 'My reports', icon: ClipboardList },
  { to: '/updates', label: 'Updates', icon: Bell },
  { to: '/help', label: 'Help', icon: LifeBuoy },
]
// Not a tab (five is the most a phone tab bar holds): phones reach it from Home, desktops from the sidebar.
export const COMMUNITY = { to: '/community', label: 'Community map', icon: MapIcon }

const UserContext = createContext<User | null>(null)
/** The signed-in resident, for greetings. */
export const useResident = () => useContext(UserContext)!

/** Avatar for the right of each resident large title (phones and tablets; desktops use the sidebar). */
export function ResidentAccount() {
  const user = useResident()
  return useMediaQuery(DESKTOP) ? null : <AccountButton user={user} />
}

function TabBar() {
  const t = useText()
  const unread = useUnread()
  return (
    <nav
      aria-label={t('Resident sections')}
      className="glass pb-safe fixed inset-x-0 bottom-0 z-40 shadow-[0_-0.5px_0_var(--border)] lg:hidden md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[min(560px,calc(100%-48px))] md:-translate-x-1/2 md:rounded-full md:pb-0 md:shadow-[0_8px_30px_rgb(0_0_0/0.12),0_0_0_0.5px_var(--border)]"
    >
      <ul className="mx-auto flex h-[var(--tabbar)] max-w-2xl items-stretch">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to !== '/reports'}
              className={({ isActive }) =>
                cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <m.span
                      className="block"
                      animate={{ scale: isActive ? 1 : 0.92, y: isActive ? -1 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                      <Icon className="size-6" strokeWidth={isActive ? 2.3 : 1.8} aria-hidden="true" />
                    </m.span>
                    {to === '/updates' && unread > 0 && (
                      <m.span
                        key={unread}
                        initial={{ scale: 0.4 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                        aria-label={`${unread} ${t('unread')}`}
                        className="absolute -top-1 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[11px] leading-none font-semibold text-white"
                      >
                        {unread}
                      </m.span>
                    )}
                  </span>
                  <Txt>{label}</Txt>
                </>
              )}
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

/** Phone-first resident app: one column, large titles, iOS-style tab bar (a floating capsule on tablets, a sidebar on desktops). */
export function ResidentShell({ user }: { user: User }) {
  const desktop = useMediaQuery(DESKTOP)
  return (
    <UserContext.Provider value={user}>
      <div className="resident-shell min-h-dvh">
        {desktop && (
          <Suspense fallback={null}>
            <SideBar user={user} />
          </Suspense>
        )}
        {/* Desktop pages pick their own width (lists, split views); phones and tablets keep one centred column. */}
        <main className="mx-auto max-w-2xl px-4 pb-[calc(var(--tab-offset)+12px)] sm:px-6 md:pb-32 lg:ml-[17rem] lg:max-w-none lg:px-10 lg:pb-10">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
        {!desktop && <TabBar />}
      </div>
    </UserContext.Provider>
  )
}
