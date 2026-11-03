import type { Report } from './types'

/** One entry per grouped case (its first report) plus every report not in a confirmed case, with case sizes. */
export function groupCases(reports: Report[]) {
  const lead = new Map<string, Report>()
  const size = new Map<string, number>()
  for (const report of reports) {
    if (!report.case_id || !report.case_confirmed) continue
    size.set(report.case_id, (size.get(report.case_id) ?? 0) + 1)
    const current = lead.get(report.case_id)
    if (!current || (report.created_at ?? '') < (current.created_at ?? '')) lead.set(report.case_id, report)
  }
  const rows = reports.filter(
    report => !report.case_id || !report.case_confirmed || lead.get(report.case_id) === report,
  )
  return {
    rows,
    sizeOf: (report: Report) => (report.case_confirmed && report.case_id ? size.get(report.case_id) : 1) ?? 1,
  }
}
