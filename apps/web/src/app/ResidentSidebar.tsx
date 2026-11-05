import { Link, NavLink } from 'react-router'
import { SquarePen } from 'lucide-react'
import { Wordmark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { navIconStyle, navItemClass } from '@/components/nav'
import { Txt, useText } from '../lib/i18n'
import type { User } from '../features/auth/queries'
import { AccountIdentity, AccountMenu } from '../features/account/AccountMenu'
import { COMMUNITY, NAV_COLOR, REWARDS, TABS, useUnread } from './ResidentShell'

// Report is the green button above the list, so it isn't repeated among the links.
const LINKS = [TABS[0], TABS[2], COMMUNITY, REWARDS, ...TABS.slice(3)]

/** Desktop navigation (1024px and up), in place of the tab bar: the main action, the sections and the account menu.
    Each destination appears once. */
export function SideBar({ user }: { user: User }) {
  const t = useText()
  const unread = useUnread()
  return (
    <aside className="scroll-thin fixed top-[var(--offline-h)] bottom-0 left-0 z-40 flex w-[17rem] flex-col gap-6 overflow-y-auto border-r-2 bg-sidebar px-4 pt-7 pb-4">
      <Link to="/home" className="rounded-xl px-2" aria-label={t('BarangAI home')}>
        <Wordmark />
      </Link>
      <Button asChild size="lg" className="w-full">
        <Link to="/report">
          <SquarePen />
          <Txt>Report a concern</Txt>
        </Link>
      </Button>
      <nav aria-label={t('Resident sections')}>
        <ul className="space-y-1.5">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} end={to !== '/reports'} className={({ isActive }) => navItemClass(isActive)}>
                <Icon
                  className="size-7 shrink-0 transition-transform duration-200 group-hover/nav:-rotate-6 group-hover/nav:scale-110"
                  style={navIconStyle(NAV_COLOR[to])}
                  strokeWidth={2.3}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">
                  <Txt>{label}</Txt>
                </span>
                {to === '/updates' && unread > 0 && (
                  <span
                    aria-label={`${unread} ${t('unread')}`}
                    className="grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-1.5 text-[12px] font-extrabold tracking-normal text-white dark:text-[#131f24]"
                  >
                    {unread}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto">
        <AccountMenu
          trigger={
            <button
              type="button"
              aria-label={t('Account and settings')}
              className="flex w-full items-center gap-2.5 rounded-xl border-2 border-transparent p-2 text-left transition-colors hover:border-border hover:bg-muted"
            >
              <AccountIdentity user={user} />
            </button>
          }
        />
      </div>
    </aside>
  )
}
