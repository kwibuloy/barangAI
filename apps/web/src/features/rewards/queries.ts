import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, post } from '../../lib/api'

export type PointEntry = {
  id: string
  kind: 'accepted' | 'resolved' | 'first_reporter' | 'redeem' | 'refund' | 'reversal'
  amount: number
  created_at: string
}
export type Reward = {
  id: string
  barangay_id: string
  name: string
  description: string | null
  partner: string | null
  points_cost: number
  stock: number | null
  active?: boolean
  barangay?: string | null
}
export type Voucher = {
  id: string
  code: string
  status: 'active' | 'used' | 'expired'
  points_cost: number
  reward: string
  partner: string | null
  barangay: string
  created_at: string
  expires_at: string
  used_at: string | null
}
export type NewReward = {
  name: string
  points_cost: number
  stock?: number | null
  partner?: string
  barangay_id?: string
}

const keys = {
  points: ['points'] as const,
  vouchers: ['vouchers'] as const,
  barangays: ['rewards', 'barangays'] as const,
  shop: (barangay: string) => ['rewards', 'shop', barangay] as const,
  manage: ['rewards', 'manage'] as const,
}

export const pointsKey = keys.points

export const usePoints = () =>
  useQuery({ queryKey: keys.points, queryFn: () => api<{ balance: number; history: PointEntry[] }>('/points') })

export const useVouchers = () =>
  useQuery({ queryKey: keys.vouchers, queryFn: () => api<{ available: Voucher[]; history: Voucher[] }>('/vouchers') })

export const useShopBarangays = () =>
  useQuery({ queryKey: keys.barangays, queryFn: () => api<{ id: string; name: string }[]>('/rewards/barangays') })

export const useShop = (barangay: string) =>
  useQuery({
    queryKey: keys.shop(barangay),
    queryFn: () => api<Reward[]>(`/rewards?barangay_id=${encodeURIComponent(barangay)}`),
    enabled: Boolean(barangay),
  })

export function useRedeem() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (reward: string) => post<Voucher>(`/rewards/${reward}/redeem`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.points })
      void client.invalidateQueries({ queryKey: keys.vouchers })
      void client.invalidateQueries({ queryKey: ['rewards'] })
    },
  })
}

export const useManagedRewards = (barangay = '') =>
  useQuery({
    queryKey: [...keys.manage, barangay],
    queryFn: () => api<Reward[]>(`/rewards/manage${barangay ? `?barangay_id=${encodeURIComponent(barangay)}` : ''}`),
  })

export function useCreateReward() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (reward: NewReward) => post<Reward>('/rewards', reward),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.manage }),
  })
}

export function useSetRewardActive() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<Reward>(`/rewards/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.manage }),
  })
}

export const useUseVoucher = () =>
  useMutation({ mutationFn: (code: string) => post<Voucher>('/vouchers/use', { code }) })
