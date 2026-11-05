import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

/** Who runs this service, as the operator published it; both empty until set, and pages then say so. */
export const useOperator = () =>
  useQuery({
    queryKey: ['legal-operator'],
    queryFn: () => api<{ name: string | null; contact: string | null }>('/legal/operator'),
    staleTime: Infinity,
  })
