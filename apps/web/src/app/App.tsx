import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { focusManager, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router'
import { LazyMotion, MotionConfig } from 'motion/react'
import { LoaderCircle } from 'lucide-react'
import { ApiError } from '../lib/api'
import { sessionExpired } from '../features/auth/queries'
import { LanguageProvider, Txt } from '../lib/i18n'
import { AuthPage } from '../features/auth/AuthPage'
import { isStaff, useMe } from '../features/auth/queries'
import { ForcedPasswordChange } from '../features/account/ForcedPasswordChange'
import { PreferenceSync } from '../features/account/PreferenceSync'
import { NotificationsPage } from '../features/notifications/NotificationsPage'
import { HomePage } from '../features/home/HomePage'
import { ReportForm } from '../features/reports/ReportForm'
import { ReportsPage } from '../features/reports/ReportsPage'
import { ThemeProvider } from '../lib/theme'
import { PageSpinner } from '@/components/page'
import { ServerProblem } from '@/components/ServerProblem'
import { useRouteTitle } from '@/hooks/use-route-title'
import { ResidentShell } from './ResidentShell'
import { removeExpiredDrafts } from '../features/reports/draft'
import 'leaflet/dist/leaflet.css'
import '../styles.css'

// Residents never download the staff dashboard; chat loads when first opened.
const RewardsPage = lazy(() =>
  import('../features/rewards/RewardsPage').then(module => ({ default: module.RewardsPage })),
)
const RewardsDeskPage = lazy(() =>
  import('../features/staff/RewardsDeskPage').then(module => ({ default: module.RewardsDeskPage })),
)
const RecordsPage = lazy(() =>
  import('../features/staff/RecordsPage').then(module => ({ default: module.RecordsPage })),
)
const StaffShell = lazy(() => import('../features/staff/StaffShell').then(module => ({ default: module.StaffShell })))
const OverviewPage = lazy(() =>
  import('../features/staff/OverviewPage').then(module => ({ default: module.OverviewPage })),
)
const QueuePage = lazy(() => import('../features/staff/QueuePage').then(module => ({ default: module.QueuePage })))
const UpdatesPage = lazy(() =>
  import('../features/staff/UpdatesPage').then(module => ({ default: module.UpdatesPage })),
)
const AccountsPage = lazy(() =>
  import('../features/staff/AccountsPage').then(module => ({ default: module.AccountsPage })),
)
const StaffHelpPage = lazy(() => import('../features/staff/HelpPage').then(module => ({ default: module.HelpPage })))
const MapPage = lazy(() => import('../features/staff/MapPage').then(module => ({ default: module.MapPage })))
const CommunityPage = lazy(() =>
  import('../features/community/CommunityPage').then(module => ({ default: module.CommunityPage })),
)
const ChatPage = lazy(() => import('../features/chat/ChatPage').then(module => ({ default: module.ChatPage })))
const LegalPage = lazy(() => import('../features/legal/LegalPage').then(module => ({ default: module.LegalPage })))
const motionFeatures = () => import('./motionFeatures').then(module => module.default)

/** Retry flaky mobile networks and server errors, never client errors such as 401 or 404. */
const retry = (count: number, error: Error) => count < 2 && !(error instanceof ApiError && error.status < 500)

// Query v5 refetches on visibilitychange only; also refetch when a visible window regains focus
// (a desktop resident switching back from another window should see new status updates).
focusManager.setEventListener(handleFocus => {
  const onFocus = () => handleFocus(true)
  const onVisibility = () => handleFocus(document.visibilityState === 'visible')
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  }
})

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>
}

/** Each new page opens at its top (a tapped card or tab must not inherit the last page's scroll); back and forward
    keep the browser's own position. */
function ScrollToTop() {
  const { pathname } = useLocation()
  const navigation = useNavigationType()
  useEffect(() => {
    if (navigation !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navigation])
  return null
}

function AppRoutes() {
  const me = useMe()
  const { pathname } = useLocation()
  // No answer about the session isn't the same as signed out: it gets a retry, never the sign-in page.
  const unknown = Boolean(me.error) && me.data === undefined
  useRouteTitle(pathname, me.isPending || unknown || Boolean(me.data), Boolean(me.data?.must_change_password))
  // Readable before signing up, and the same page for every role.
  if (pathname === '/terms' || pathname === '/privacy')
    return (
      <Lazy>
        <LegalPage page={pathname === '/terms' ? 'terms' : 'privacy'} />
      </Lazy>
    )
  if (me.isPending)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={30} />
        <span>
          <Txt>Opening BarangAI…</Txt>
        </span>
      </div>
    )
  if (unknown) return <ServerProblem error={me.error} retrying={me.isFetching} onRetry={() => void me.refetch()} />
  if (!me.data) return <AuthPage />
  // Before everything else, so nothing that writes starts and fails: the API refuses other writes until this is done.
  if (me.data.must_change_password) return <ForcedPasswordChange />
  return (
    <>
      <ScrollToTop />
      <PreferenceSync user={me.data} />
      <Routes>
        {isStaff(me.data) ? (
          <Route
            element={
              <Lazy>
                <StaffShell user={me.data} />
              </Lazy>
            }
          >
            <Route path="desk" element={<OverviewPage />} />
            <Route path="desk/reports" element={<QueuePage />} />
            <Route path="desk/reports/:id" element={<QueuePage />} />
            <Route path="desk/map" element={<MapPage />} />
            <Route path="desk/updates" element={<UpdatesPage />} />
            <Route path="desk/rewards" element={<RewardsDeskPage />} />
            <Route path="desk/records" element={<RecordsPage />} />
            <Route path="desk/help" element={<StaffHelpPage />} />
            {me.data.role === 'administrator' && <Route path="desk/accounts" element={<AccountsPage />} />}
            <Route path="*" element={<Navigate to="/desk" replace />} />
          </Route>
        ) : (
          <Route element={<ResidentShell user={me.data} />}>
            <Route path="home" element={<HomePage />} />
            <Route path="report" element={<ReportForm />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:id" element={<ReportsPage />} />
            <Route path="community" element={<CommunityPage />} />
            <Route path="updates" element={<NotificationsPage />} />
            <Route path="help" element={<ChatPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        )}
      </Routes>
    </>
  )
}

export default function App() {
  useEffect(() => {
    void removeExpiredDrafts()
  }, [])
  const [client] = useState(() => {
    const created: QueryClient = new QueryClient({
      // Live checks would otherwise stop on an expired session and leave a frozen, signed-in screen.
      queryCache: new QueryCache({
        onError: error => {
          if (error instanceof ApiError && error.status === 401) sessionExpired(created)
        },
      }),
      // Always ask the laptop: the browser's own idea of being online says nothing about a local server, and a
      // write it paused would look like a spinner that never ends.
      defaultOptions: {
        queries: { retry, networkMode: 'always' },
        mutations: { retry: false, networkMode: 'always' },
      },
    })
    return created
  })
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LanguageProvider>
          {/* Motion follows the OS reduce-motion setting. */}
          <LazyMotion features={motionFeatures} strict>
            <MotionConfig reducedMotion="user">
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </MotionConfig>
          </LazyMotion>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
