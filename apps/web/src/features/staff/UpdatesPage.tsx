import { Link } from 'react-router'
import { FilePlus2, MessageSquarePlus, Trash2 } from 'lucide-react'
import { DateText } from '@/components/DateText'
import { Alert, EmptyState } from '@/components/page'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../lib/i18n'
import { useMarkRead, useNotifications } from '../notifications/NotificationsPage'
import { label } from '../reports/categories'
import { CategoryTile } from '../reports/CategoryIcon'
import { useReports } from '../reports/queries'
import { StatusBadge } from '../reports/StatusBadge'

const KIND = {
  new_report: { text: 'New report', icon: FilePlus2 },
  addendum: { text: 'A resident added details', icon: MessageSquarePlus },
  deletion_request: { text: 'A resident asked to delete a report', icon: Trash2 },
} as const

/** Staff inbox: new reports and details residents added, newest first. Opening one marks it read. */
export function UpdatesPage() {
  const t = useText()
  const notices = useNotifications()
  const reports = useReports()
  const markRead = useMarkRead()
  const byId = new Map((reports.data ?? []).map(report => [report.id, report]))
  const items = (Array.isArray(notices.data) ? notices.data : []).filter(
    item => item.kind === 'new_report' || item.kind === 'addendum' || item.kind === 'deletion_request',
  )
  const unread = items.filter(item => !item.read_at)
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[30px] leading-tight">
            <Txt>Updates</Txt>
          </h1>
          <p className="text-[14px] text-muted-foreground">
            {unread.length} {t('unread')}
          </p>
        </div>
        {unread.length > 0 && (
          <button
            type="button"
            className="min-h-11 px-2 label-caps text-[13px] text-link"
            onClick={() => unread.forEach(item => markRead.mutate(item.id))}
          >
            <Txt>Mark all read</Txt>
          </button>
        )}
      </div>
      {notices.error && (
        <Alert>
          <Txt>{notices.error.message}</Txt>
        </Alert>
      )}
      {notices.isSuccess && items.length === 0 ? (
        <EmptyState
          pose="clipboard"
          title={t('No updates yet.')}
          body={t('New reports and details residents add will appear here.')}
        />
      ) : (
        <ul className="edge overflow-hidden rounded-2xl">
          {items.map(item => {
            const report = byId.get(item.report_id)
            const kind = KIND[item.kind as keyof typeof KIND]
            return (
              <li key={item.id} className="[&+&]:border-t">
                <Link
                  to={`/desk/reports/${item.report_id}`}
                  onClick={() => !item.read_at && markRead.mutate(item.id)}
                  className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2.5 shrink-0 self-start rounded-full mt-4',
                      item.read_at ? 'bg-transparent' : 'bg-sky',
                    )}
                  />
                  {report && <CategoryTile category={report.resident_category} />}
                  {/* One column, so phones keep the title wide: status and date go under it. */}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5 text-[15px]">
                      <kind.icon className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
                      <strong className={cn('min-w-0 flex-1', item.read_at ? 'font-bold' : 'font-extrabold')}>
                        <Txt>{kind.text}</Txt>
                      </strong>
                    </span>
                    <span className="block truncate text-[14px] text-muted-foreground">
                      {report ? t(label(report.resident_category)) : t('Report')} · #
                      {item.report_id.slice(0, 8).toUpperCase()}
                      {report?.location_label ? ` · ${report.location_label}` : ''}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {report && <StatusBadge status={report.status} />}
                      <small className="text-[13px] text-muted-foreground">
                        <DateText value={item.created_at} compact />
                      </small>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
