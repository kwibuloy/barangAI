import { lazy, Suspense, useState, type ReactNode } from 'react'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LazyMotion, MotionConfig } from 'motion/react'
import { LoaderCircle } from 'lucide-react'
import { ApiError } from '../lib/api'
import { LanguageProvider, Txt } from '../lib/i18n'
import { AuthPage } from '../features/auth/AuthPage'
import { isStaff, useMe } from '../features/auth/queries'
import { PreferenceSync } from '../features/account/PreferenceSync'
import { NotificationsPage } from '../features/notifications/NotificationsPage'
import { HomePage } from '../features/home/HomePage'
import { ReportForm } from '../features/reports/ReportForm'
import { ReportsPage } from '../features/reports/ReportsPage'
import { ThemeProvider } from '../lib/theme'
import { PageSpinner } from '@/components/page'
import { ResidentShell } from './ResidentShell'
import 'leaflet/dist/leaflet.css'
import '../styles.css'

// Residents never download the staff dashboard; chat loads when first opened.
const StaffShell = lazy(() => import('../features/staff/StaffShell').then(module => ({ default: module.StaffShell })))
const OverviewPage = lazy(() =>
  import('../features/staff/OverviewPage').then(module => ({ default: module.OverviewPage })),
)
const QueuePage = lazy(() => import('../features/staff/QueuePage').then(module => ({ default: module.QueuePage })))
const UpdatesPage = lazy(() =>
  import('../features/staff/UpdatesPage').then(module => ({ default: module.UpdatesPage })),
)
const MapPage = lazy(() => import('../features/staff/MapPage').then(module => ({ default: module.MapPage })))
const CommunityPage = lazy(() =>
  import('../features/community/CommunityPage').then(module => ({ default: module.CommunityPage })),
)
const ChatPage = lazy(() => import('../features/chat/ChatPage').then(module => ({ default: module.ChatPage })))
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

function AppRoutes() {
  const me = useMe()
  if (me.isPending)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={30} />
        <span>
          <Txt>Opening BarangAI…</Txt>
        </span>
      </div>
    )
  if (!me.data) return <AuthPage />
  return (
    <>
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
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        )}
      </Routes>
    </>
  )
}

export default function App() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry }, mutations: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LanguageProvider>
          {/* Motion follows the OS reduce-motion setting. */}
          <LazyMotion features={motionFeatures} strict>
            <MotionConfig reducedMotion="user">
              {/* The backdrop sun (styles.css); purely decorative. */}
              <div className="app-sun" aria-hidden="true" />
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
