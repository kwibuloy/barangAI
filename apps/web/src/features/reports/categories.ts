import type { Category, Hazard, Status } from './types'

/** Why staff may reject a report; the API checks these same values, and residents see the label. */
export const rejectionReasons = [
  { value: 'not_barangay_concern', label: 'Not a barangay concern' },
  { value: 'already_reported', label: 'Already reported' },
  { value: 'not_enough_details', label: 'Not enough details or unclear photo' },
  { value: 'no_problem_found', label: 'No problem found when checked' },
  { value: 'outside_area', label: "Outside this barangay's area" },
  { value: 'false_or_inappropriate', label: 'False or inappropriate report' },
  { value: 'other', label: 'Other reason' },
] as const

export const categories: { value: Category; label: string }[] = [
  { value: 'flooding', label: 'Flooding' },
  { value: 'fallen_trees', label: 'Fallen trees' },
  { value: 'broken_streetlights', label: 'Broken streetlights' },
  { value: 'exposed_wiring', label: 'Exposed wiring' },
  { value: 'potholes', label: 'Potholes' },
  { value: 'uncollected_garbage', label: 'Uncollected garbage' },
  { value: 'damaged_signage', label: 'Damaged signage' },
  { value: 'fire_hazard', label: 'Fire or fire hazard' },
  { value: 'other', label: 'Other' },
]

export const statuses: Status[] = ['Pending', 'Under Verification', 'Accepted', 'In Progress', 'Resolved', 'Rejected']

export const label = (category?: Category | null) =>
  categories.find(item => item.value === category)?.label ?? 'Not set'

export const hazardLabels: Record<Hazard, string> = {
  electrical_hazard: 'Electrical hazard',
  blocks_road: 'Blocks the road',
  risk_to_people: 'Risk to people',
}
