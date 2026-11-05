import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, post } from '../../lib/api'

export type StaffAccount = {
  id: string
  email: string
  role: 'staff' | 'administrator'
  barangay: string | null
  disabled: boolean
  must_change_password?: boolean
}
export type ServerAddress = { url: string; listening: boolean }
export type VoucherLog = {
  id: string
  code: string
  status: 'active' | 'used' | 'expired'
  reward: string
  barangay: string | null
  points_cost: number
  redeemed_by: string
  redeemed_at: string
  expires_at: string
  honoured_by: string | null
  honoured_at: string | null
}
export type RewardChangeLog = {
  id: string
  reward: string
  barangay: string | null
  actor_id: string
  action: 'created' | 'changed'
  changes: Record<string, unknown>
  created_at: string
}
export type FeedbackNote = { id: string; user_id: string; message: string; created_at: string }

const staffKey = ['admin', 'staff'] as const

export const useStaffAccounts = () =>
  useQuery({ queryKey: staffKey, queryFn: () => api<StaffAccount[]>('/admin/staff') })

export const useAdminBarangays = () =>
  useQuery({ queryKey: ['admin', 'barangays'], queryFn: () => api<{ id: string; name: string }[]>('/admin/barangays') })

export const useServerAddress = () =>
  useQuery({
    queryKey: ['admin', 'server-address'],
    queryFn: () => api<{ addresses: ServerAddress[] }>('/admin/server-address'),
  })

export function useAddStaff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; role: StaffAccount['role']; barangay?: string }) =>
      post<StaffAccount & { temporary_password: string }>('/admin/staff', body),
    onSuccess: () => client.invalidateQueries({ queryKey: staffKey }),
  })
}

export function useChangeStaff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; barangay?: string; disabled?: boolean }) =>
      api<StaffAccount>(`/admin/staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: staffKey }),
  })
}

export function useResetStaffPassword() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => post<{ temporary_password: string }>(`/admin/staff/${id}/reset-password`),
    onSuccess: () => client.invalidateQueries({ queryKey: staffKey }),
  })
}

export const useRewardsLog = (code: string) =>
  useQuery({
    queryKey: ['admin', 'rewards-log', code],
    queryFn: () =>
      api<{ reward_changes: RewardChangeLog[]; vouchers: VoucherLog[] }>(
        `/admin/rewards/log?limit=200${code ? `&code=${encodeURIComponent(code)}` : ''}`,
      ),
  })

export const useFeedbackNotes = (enabled: boolean) =>
  useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api<FeedbackNote[]>('/admin/feedback'), enabled })

export function useDeleteFeedback() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/feedback/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  })
}

export { useOperator } from '../legal/operator'
