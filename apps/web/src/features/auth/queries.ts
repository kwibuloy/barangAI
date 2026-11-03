import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, post } from '../../lib/api'

export type Preferences = { theme?: 'system' | 'light' | 'dark'; language?: 'en' | 'fil' }
export type User = {
  id: string
  email: string
  role: 'resident' | 'staff' | 'administrator'
  /** Saved on the account so they follow the person to another device. */
  preferences?: Preferences
  /** Signs in with Google, so it has no password of its own. */
  google?: boolean
}

const meKey = ['me'] as const
export const isStaff = (user: User) => user.role === 'staff' || user.role === 'administrator'

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
    onSuccess: user => client.setQueryData(meKey, user),
  })
}

export function useSignOut() {
  const finish = useFinishSession()
  return useMutation({ mutationFn: () => post<void>('/auth/logout'), onSuccess: finish })
}

function useFinishSession() {
  const client = useQueryClient()
  return () => {
    // Drop every cached report so the next account starts clean. Keep the `me` entry itself:
    // useMe stays subscribed to it, so removing it would leave the signed-in screen up.
    client.removeQueries({ predicate: query => query.queryKey[0] !== meKey[0] })
    client.getMutationCache().clear()
    client.setQueryData(meKey, null)
  }
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => post<void>('/auth/password', body),
  })
}

export function useDeleteAccount() {
  const finish = useFinishSession()
  return useMutation({
    mutationFn: (body: { email: string; password?: string }) => post<void>('/auth/delete-account', body),
    onSuccess: finish,
  })
}
