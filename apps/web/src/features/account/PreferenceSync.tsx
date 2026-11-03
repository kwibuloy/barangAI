import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLanguage } from '../../lib/i18n'
import { useTheme } from '../../lib/theme'
import type { User } from '../auth/queries'

/**
 * Keeps appearance and language on the account, so they follow the person to another phone or computer.
 * On sign-in the account's saved choices win over this device's; after that, changes made here are saved.
 * The device keeps its own copy too (localStorage), so the first paint never waits for the network.
 */
export function PreferenceSync({ user }: { user: User }) {
  const { theme, setTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const client = useQueryClient()
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (applied.current === user.id) return
    applied.current = user.id
    const saved = user.preferences ?? {}
    if (saved.theme && saved.theme !== theme) setTheme(saved.theme)
    if (saved.language && saved.language !== language) setLanguage(saved.language)
    // Only on sign-in (a new user id), never when this device changes a setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])
  useEffect(() => {
    if (applied.current !== user.id) return
    const saved = user.preferences ?? {}
    if (saved.theme === theme && saved.language === language) return
    // A short wait so the sign-in update above lands first and a quick double toggle saves once.
    const timer = setTimeout(() => {
      api<User>('/auth/preferences', { method: 'PUT', body: JSON.stringify({ theme, language }) })
        // Only a real account replaces the signed-in user; anything else leaves it as it was.
        .then(updated => updated?.id === user.id && client.setQueryData(['me'], updated))
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [theme, language, user, client])
  return null
}
