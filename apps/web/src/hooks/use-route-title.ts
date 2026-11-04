import { useEffect } from 'react'
import { useText } from '../lib/i18n'

// First match wins: screen readers announce the tab title on every page change.
const TITLES: [RegExp, string][] = [
  [/^\/terms$/, 'Terms and conditions'],
  [/^\/privacy$/, 'Privacy notice'],
  [/^\/desk\/reports\/.+/, 'Report details'],
  [/^\/desk\/reports/, 'Reports'],
  [/^\/desk\/map/, 'Map'],
  [/^\/desk\/updates/, 'Updates'],
  [/^\/desk\/rewards/, 'Rewards'],
  [/^\/desk\/records/, 'Monthly report'],
  [/^\/desk\/accounts/, 'Staff accounts'],
  [/^\/desk\/help/, 'Help'],
  [/^\/desk/, 'Overview'],
  [/^\/home/, 'Home'],
  [/^\/report\/?$/, 'Report'],
  [/^\/reports\/.+/, 'Report details'],
  [/^\/reports/, 'My reports'],
  [/^\/community/, 'Community map'],
  [/^\/updates/, 'Updates'],
  [/^\/help/, 'Help'],
  [/^\/rewards/, 'Rewards'],
]

/** The tab title for this route, in the interface language. */
export function useRouteTitle(pathname: string, signedIn: boolean, mustChangePassword: boolean) {
  const t = useText()
  const route = TITLES.find(([pattern]) => pattern.test(pathname))?.[1]
  const legal = pathname === '/terms' || pathname === '/privacy'
  const page = legal ? route : !signedIn ? 'Sign in' : mustChangePassword ? 'Change password' : route
  const title = page ? `${t(page)} · BarangAI` : 'BarangAI'
  useEffect(() => {
    document.title = title
  }, [title])
}
