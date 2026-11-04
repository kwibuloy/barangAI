import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { DateText } from '@/components/DateText'
import { Alert, EmptyState, LargeTitle } from '@/components/page'
import { api, post } from '../../lib/api'
import { every, LIVE_NOTICES_MS, shownError } from '../../lib/live'
import { Txt, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { label } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { reportKeys, useReports } from '../reports/queries'
import { pointsKey } from '../rewards/queries'
import { StatusBadge } from '../reports/StatusBadge'
import type { Status } from '../reports/types'

export type Notice = {
  id: string
  report_id: string
  status: Status
  /** "status" for residents; "new_report" and "addendum" tell staff something arrived. */
  kind?: 'status' | 'new_report' | 'addendum' | 'deletion_request' | 'deletion_declined'
  created_at: string
  read_at: string | null
}
const noticeKey = ['notifications'] as const

/** Checks every few seconds while the app is on screen, and when the resident returns to it. */
export function useNotifications() {
  return useQuery({
    queryKey: noticeKey,
    queryFn: () => api<Notice[]>('/notifications'),
    refetchInterval: every(LIVE_NOTICES_MS),
  })
}

/** When a new notice arrives, brings the reports and points on screen up to date. Mount once, in each shell. */
export function useLiveRefresh() {
  const client = useQueryClient()
  const notices = useNotifications().data
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!Array.isArray(notices)) return
    const known = seen.current
    seen.current = new Set(notices.map(item => item.id))
    if (known && notices.some(item => !known.has(item.id))) {
      void client.invalidateQueries({ queryKey: reportKeys.all })
      void client.invalidateQueries({ queryKey: pointsKey })
    }
  }, [client, notices])
}

export function useMarkRead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => post<Notice>(`/notifications/${id}/read`),
    // A check already on its way must not bring back the unread mark.
    onMutate: () => client.cancelQueries({ queryKey: noticeKey }),
    onSuccess: saved =>
      client.setQueryData<Notice[]>(noticeKey, items => items?.map(item => (item.id === saved.id ? saved : item))),
  })
}

const SENTENCE: Record<Status, string> = {
  Pending: 'Your report was received.',
  'Under Verification': 'Barangay staff are checking your report.',
  Accepted: 'Your report was accepted.',
  'In Progress': 'Work on your report has started.',
  Resolved: 'Your report was resolved.',
  Rejected: 'Your report was not accepted.',
}

export function NotificationsPage() {
  const t = useText()
  const notices = useNotifications()
  const reports = useReports()
  const markRead = useMarkRead()
  const items = notices.data ?? []
  const unread = items.filter(item => !item.read_at).length
  const byId = new Map((reports.data ?? []).map(report => [report.id, report]))
  return (
    <div className="lg:mx-auto lg:max-w-3xl">
      <LargeTitle
        title={t('Updates')}
        subtitle={unread > 0 ? `${unread} ${t('unread')}` : undefined}
        trailing={<ResidentAccount />}
      />
      {shownError(notices) && (
        <Alert className="mb-4">
          <Txt>{shownError(notices)?.message ?? ''}</Txt>
        </Alert>
      )}
      {notices.data && items.length === 0 ? (
        <EmptyState
          pose="arms"
          title={t('No updates yet.')}
          body={t('We will tell you here when your reports move.')}
        />
      ) : (
        <ul className="space-y-2.5 lg:hairline lg:space-y-0 lg:overflow-hidden lg:rounded-2xl lg:bg-card">
          <AnimatePresence initial={false}>
            {items.map(item => {
              const report = byId.get(item.report_id)
              return (
                <m.li
                  layout
                  key={item.id}
                  className="flex items-start gap-3.5 py-4 pl-4 max-lg:rounded-2xl max-lg:border-2 max-lg:border-b-4 max-lg:bg-card max-lg:data-unread:border-[#84d8ff] max-lg:data-unread:bg-sky-soft/50 lg:[&+&]:border-t dark:max-lg:data-unread:border-[#3f8db5]"
                  data-unread={!item.read_at || undefined}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[14px] size-2.5 shrink-0 rounded-full transition-colors ${item.read_at ? 'bg-transparent' : 'bg-sky'}`}
                  />
                  {report && <CategoryTile category={report.resident_category} />}
                  <div className="min-w-0 flex-1 pr-4">
                    {/* The whole message opens the report (and counts as read), like a Mail row. */}
                    <Link
                      to={report ? `/reports/${item.report_id}` : '/updates'}
                      onClick={() => !item.read_at && markRead.mutate(item.id)}
                      className="block rounded-lg"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <strong
                          className={`line-clamp-2 text-[16px] leading-snug ${item.read_at ? 'font-bold' : 'font-extrabold'}`}
                        >
                          {report ? (
                            <Txt>{label(report.resident_category)}</Txt>
                          ) : (
                            `${t('Report')} ${item.report_id.slice(0, 8)}`
                          )}
                        </strong>
                        <small className="shrink-0 text-[13px] text-muted-foreground">
                          <DateText value={item.created_at} compact />
                        </small>
                      </span>
                      <span className="mt-0.5 block text-[15px] text-muted-foreground">
                        <Txt>
                          {item.kind === 'deletion_declined'
                            ? 'An administrator declined your deletion request.'
                            : SENTENCE[item.status]}
                        </Txt>
                      </span>
                    </Link>
                    {/* Wraps under the badge when a translation is long ("Markahang nabasa") rather than running off the card. */}
                    <div className="mt-2.5 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <StatusBadge status={item.status} />
                      {!item.read_at && (
                        <button
                          type="button"
                          disabled={markRead.isPending}
                          onClick={() => markRead.mutate(item.id)}
                          className="-my-1.5 inline-flex min-h-11 shrink-0 items-center px-2 label-caps text-[13px] whitespace-nowrap text-link"
                        >
                          <Txt>Mark read</Txt>
                        </button>
                      )}
                    </div>
                  </div>
                </m.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
