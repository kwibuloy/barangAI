import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { endGlassesSession } from '../glasses/connection'
import { ApiError, api, post } from '../../lib/api'

export type Preferences = { theme?: 'system' | 'light' | 'dark'; language?: 'en' | 'fil' }
export type User = {
  id: string
  email: string
  role: 'resident' | 'staff' | 'administrator'
  /** The barangay a staff member is limited to; administrators have none. */
  barangay?: string | null
  /** Saved on the account so they follow the person to another device. */
  preferences?: Preferences
  /** Signs in with Google, so it has no password of its own. */
  google?: boolean
  /** Still on a temporary password an administrator issued: nothing else works until it is changed. */
  must_change_password?: boolean
}

const meKey = ['me'] as const
const RETURNING = 'barangai-returning'

/** Remember this device once a session exists, whichever way it signed in (password or Google). */
export function markReturningVisitor() {
  try {
    localStorage.setItem(RETURNING, '1')
  } catch {
    // Private mode: Kap introduces himself again next time.
  }
}

/** Whether someone has signed in on this device before, so Kap says "welcome back" instead of introducing
    himself. One flag, no personal data; private browsing simply gets the introduction again. */
export function isReturningVisitor() {
  try {
    return localStorage.getItem(RETURNING) === '1'
  } catch {
    return false
  }
}
export const isStaff = (user: User) => user.role === 'staff' || user.role === 'administrator'

/** Set when a session ends by itself, so the sign-in page can say why it appeared. */
export const sessionEndedKey = ['session-ended'] as const

/** The signed-in user, or null when the session is missing or expired. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () =>
      api<User>('/auth/me').catch(error => {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }),
    staleTime: Infinity,
  })
}

export function useGoogleConfig() {
  return useQuery({
    queryKey: ['google-config'],
    queryFn: () => api<{ enabled: boolean }>('/auth/google/config'),
    staleTime: Infinity,
  })
}

export function useSignIn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      mode,
      ...credentials
    }: {
      mode: 'login' | 'register'
      email: string
      password: string
      accepted_terms?: boolean
    }) => post<User>(`/auth/${mode}`, credentials),
    onSuccess: user => {
      client.removeQueries({ queryKey: sessionEndedKey })
      client.setQueryData(meKey, user)
    },
  })
}

export function useSignOut() {
  const finish = useFinishSession()
  return useMutation({ mutationFn: () => post<void>('/auth/logout'), onSuccess: finish })
}

/** Back to sign-in: after signing out, or when a live check finds the session has expired. */
export function finishSession(client: QueryClient) {
  // Drop every cached report so the next account starts clean. Keep the `me` entry itself:
  // useMe stays subscribed to it, so removing it would leave the signed-in screen up.
  client.removeQueries({
    predicate: query => query.queryKey[0] !== meKey[0] && query.queryKey[0] !== sessionEndedKey[0],
  })
  client.getMutationCache().clear()
  client.setQueryData(meKey, null)
  // A shared phone: the next account must not inherit the glasses, their consent or a handed-over photo.
  endGlassesSession()
}

/**
 * A live check found the session gone. The signed-in screen leaves first, and everything else is cleared a moment
 * later, so no page still on screen can start a new request for what was removed. A request like that could answer
 * 401 after the next sign-in and end the new session too.
 */
export function sessionExpired(client: QueryClient) {
  if (client.getQueryData(meKey) === null) return
  client.setQueryData(sessionEndedKey, true)
  client.setQueryData(meKey, null)
  setTimeout(() => finishSession(client), 0)
}

function useFinishSession() {
  const client = useQueryClient()
  return () => finishSession(client)
}

export function useChangePassword() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => post<void>('/auth/password', body),
    onSuccess: () => client.setQueryData<User | null>(meKey, me => me && { ...me, must_change_password: false }),
  })
}

export function useDeleteAccount() {
  const finish = useFinishSession()
  return useMutation({
    mutationFn: (body: { email: string; password?: string }) => post<void>('/auth/delete-account', body),
    onSuccess: finish,
  })
}
