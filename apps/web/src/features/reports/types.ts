export type Category =
  | 'flooding'
  | 'fallen_trees'
  | 'broken_streetlights'
  | 'exposed_wiring'
  | 'potholes'
  | 'uncollected_garbage'
  | 'damaged_signage'
  | 'other'
export type Hazard = 'electrical_hazard' | 'blocks_road' | 'risk_to_people'
export type Status = 'Pending' | 'Under Verification' | 'Accepted' | 'In Progress' | 'Resolved' | 'Rejected'
export type ReportEvent = { id?: string; to_status?: Status; created_at?: string; note?: string }
export type StaffAction = { id: string; kind: 'action' | 'coordination' | 'system'; note: string; created_at: string }
export type Duplicate = {
  id: string
  candidate_report_id: string
  score: number
  decision: 'pending' | 'confirmed' | 'rejected'
}
export type DuplicateResult = {
  embedding_available: boolean
  suggestions: Duplicate[]
  manual_review_required: boolean
}
export type Report = {
  id: string
  status: Status
  resident_category: Category
  model_category?: Category | null
  verified_category?: Category | null
  description?: string | null
  latitude?: number
  longitude?: number
  location_label?: string | null
  hazards?: Hazard[]
  case_id?: string | null
  case_confirmed?: boolean
  /** Staff only; null once closed. */
  priority?: Priority | null
  /** Staff only: placed by the server from the pin. Null when the pin is outside every boundary. */
  barangay?: string | null
  /** Where the pin came from, as the resident's form reported it. */
  location_source?: 'photo' | 'device' | 'manual' | null
  /** Staff only: checks of the photo against the pin and date. Signals to look closer, never proof. */
  trust_flags?: TrustFlag[]
  addenda?: Addendum[]
  created_at?: string
  events?: ReportEvent[]
  actions?: StaffAction[]
  /** The latest request to delete this report, if any. */
  deletion_request?: {
    id: string
    status: 'pending' | 'approved' | 'declined'
    reason: string | null
    note: string | null
    created_at: string
  } | null
}
export type TrustFlag =
  | { code: 'pin_far_from_photo'; detail: number }
  | { code: 'old_photo'; detail: number }
  | { code: 'photo_date_ahead'; detail: number }
  | { code: 'no_photo_details'; detail: null }
/** Details a resident added after sending the report; the original is never changed. */
export type Addendum = { id: string; note: string; created_at: string; image_url: string | null }
/** Before submitting: the resident's own open report of this issue, or a neighbours' accepted case. */
export type Nearby = {
  own: (Report & { distance_m: number })[]
  cases: (CommunityCase & { distance_m: number })[]
}
/** Kap's daily brief: numbers counted by the API, words by the model only if every number checks out. */
export type Brief = {
  summary: string
  source: 'workers_ai' | 'template'
  facts: {
    open: number
    waiting: number
    new_today: number
    resolved_today: number
    waiting_over_a_day: number
    high_priority: { id: string; category: Category; place: string | null; score: number }[]
    high_priority_count: number
    hotspot: { place: string; open: number } | null
  }
  generated_at: string
}
export type Prediction = {
  prediction_available: boolean
  model_category: Category | null
  confidence: number | null
  suggested_description?: string | null
  // 'agreed' (both models), 'vision' (Cloudflare only), 'checker' (MobileCLIP only)
  category_source?: 'agreed' | 'vision' | 'checker' | null
  needs_check?: boolean
  // false when the vision model looked and saw nothing wrong
  problem_seen?: boolean
  hazards?: Hazard[]
}
export type PriorityReason =
  | { code: 'category'; detail: Category; points: number }
  | { code: 'hazard'; detail: Hazard; points: number }
  | { code: 'residents'; detail: number; points: number }
  | { code: 'recent'; detail: number; points: number }
/** A suggestion for staff from severity, recency and independent residents; it never reorders anything itself. */
export type Priority = { level: 'high' | 'medium' | 'low'; score: number; reasons: PriorityReason[] }
export type CaseMember = {
  id: string
  status: Status
  resident_category: Category
  created_at: string
  confirmed: boolean
}
/** A grouped case as one report sees it; staff also get its reports. */
export type ReportCase = {
  id: string
  category: Category
  location_label?: string | null
  status: Status | null
  confirmed: boolean
  /** Hidden from residents until staff accept the case. */
  reports: number | null
  contributors: number | null
  members?: CaseMember[]
}
/** An accepted case on the residents' shared map: no photos, descriptions or names. */
export type CommunityCase = {
  id: string
  category: Category
  status: Status
  latitude: number
  longitude: number
  location_label?: string | null
  /** Days only (YYYY-MM-DD, Philippine time). */
  first_reported_on: string
  last_reported_on: string
  contributors: number
  open_for_evidence: boolean
  contributed: boolean
}
