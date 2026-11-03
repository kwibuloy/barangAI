import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, post } from '../../lib/api'
import type {
  Addendum,
  Brief,
  CommunityCase,
  DuplicateResult,
  Nearby,
  Report,
  ReportCase,
  Status,
  StaffAction,
} from './types'

export const reportKeys = {
  all: ['reports'] as const,
  detail: (id: string) => ['reports', id] as const,
  duplicates: (id: string) => ['reports', id, 'duplicates'] as const,
  case: (id: string) => ['reports', id, 'case'] as const,
  // Under 'reports' so every report write refreshes the shared map too.
  community: ['reports', 'community'] as const,
}

export function useReports() {
  return useQuery({ queryKey: reportKeys.all, queryFn: () => api<Report[]>('/reports') })
}

export function useReport(id: string) {
  const client = useQueryClient()
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: () => api<Report>(`/reports/${id}`),
    // Show the list row immediately while the full history loads.
    placeholderData: () => client.getQueryData<Report[]>(reportKeys.all)?.find(report => report.id === id),
  })
}

export function useDuplicates(id: string, enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.duplicates(id),
    queryFn: () => api<DuplicateResult>(`/reports/${id}/duplicates`),
    enabled,
  })
}

export function useReportCase(id: string) {
  return useQuery({
    queryKey: reportKeys.case(id),
    queryFn: () => api<{ case: ReportCase | null }>(`/reports/${id}/case`).then(result => result.case),
  })
}

export function useCommunityCases(enabled = true) {
  return useQuery({ queryKey: reportKeys.community, queryFn: () => api<CommunityCase[]>('/cases/map'), enabled })
}

/** Invalidates every report query (lists, details, duplicates) after a successful write. */
function useReportMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const client = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => client.invalidateQueries({ queryKey: reportKeys.all }) })
}

export const useRequestDeletion = (id: string) =>
  useReportMutation((reason: string) => post(`/reports/${id}/deletion-request`, reason ? { reason } : {}))

export const useDecideDeletion = (id: string) =>
  useReportMutation((body: { decision: 'approved' | 'declined'; note?: string }) =>
    post(`/reports/${id}/deletion-request/decision`, body),
  )

export const useSubmitReport = () => useReportMutation((form: FormData) => post<Report>('/reports', form))

export const useChangeStatus = (id: string) =>
  useReportMutation((body: { status: Status; verified_category?: string; note?: string }) =>
    post<Report>(`/reports/${id}/status`, body),
  )

export const useLogAction = (id: string) =>
  useReportMutation((body: { kind: StaffAction['kind']; note: string }) =>
    post<StaffAction>(`/reports/${id}/actions`, body),
  )

export function useGenerateDuplicates(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => post<DuplicateResult>(`/reports/${id}/duplicates/generate`),
    onSuccess: result => client.setQueryData(reportKeys.duplicates(id), result),
  })
}

export const useDecideDuplicate = () =>
  useReportMutation(({ id, decision, note }: { id: string; decision: 'confirmed' | 'rejected'; note?: string }) =>
    post(`/duplicates/${id}/decision`, { decision, ...(note ? { note } : {}) }),
  )

export const useLinkReports = () =>
  useReportMutation((body: { report_id: string; other_report_id: string }) => post('/cases/link', body))

export const useCaseDecision = (id: string) =>
  useReportMutation((body: { decision: 'confirmed' | 'rejected'; note?: string }) =>
    post(`/reports/${id}/case/decision`, body),
  )

/** The resident's own open report of this issue nearby, or a neighbours' accepted case, before submitting. */
export const findNearby = (category: string, latitude: string, longitude: string, signal?: AbortSignal) =>
  api<Nearby>(`/nearby?${new URLSearchParams({ category, latitude, longitude }).toString()}`, signal ? { signal } : {})

/** Adds details (and optionally a photo) to the resident's own open report; the original stays unchanged. */
export const useAddDetails = (id: string) =>
  useReportMutation((form: FormData) => post<Addendum>(`/reports/${id}/addenda`, form))

export function useBrief(language: string) {
  return useQuery({
    queryKey: ['brief', language],
    queryFn: () => api<Brief>(`/staff/brief?language=${language}`),
    staleTime: 5 * 60_000,
  })
}
