import type { Status } from '../reports/types'

/** What each Overview figure counts and opens. The queue reads the same lists from its URL. */
export const WAITING: Status[] = ['Pending', 'Under Verification']
export const WORKING: Status[] = ['Accepted', 'In Progress']
export const OPEN: Status[] = [...WAITING, ...WORKING]
/** In the URL for every report, closed ones too. With no status at all, the queue shows open reports. */
export const ALL_STATUSES = 'all'

export const queueLink = (statuses: Status[] | typeof ALL_STATUSES) =>
  `/desk/reports?status=${statuses === ALL_STATUSES ? ALL_STATUSES : statuses.join(',').replaceAll(' ', '+')}`

/** Reads ?status= from the URL: nothing for open reports, "all", or one or more statuses separated by commas. */
export function matchesStatus(param: string): (status: Status) => boolean {
  if (param === ALL_STATUSES) return () => true
  const wanted = param ? param.split(',') : OPEN
  return status => wanted.includes(status)
}
