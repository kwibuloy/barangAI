import type { Status } from './types'

export type NotePhrase = {
  /** The chip. */
  label: string
  /** What fills the required note. Residents read it, so it says something specific that staff can stand behind. */
  note: string
  /** A rejection needs a reason from the fixed list; the chip picks the one its words mean. */
  reason?: string
}

/** Starting words for each status change, editable before sending. Filipino for all of them is in i18n.tsx. */
export const NOTE_PHRASES: Partial<Record<Status, NotePhrase[]>> = {
  'Under Verification': [
    { label: 'Checking the photo', note: 'We received your report and are checking the photo and the pin.' },
    { label: 'Visiting the place', note: 'We need to see this in person. A staff member will go and check the place.' },
  ],
  Accepted: [
    {
      label: 'Confirmed from the photo',
      note: 'We confirmed this problem from a photo and pin. It is now on our work list.',
    },
    {
      label: 'Confirmed on site',
      note: 'We went to the place and confirmed the problem. It is now on our work list.',
    },
  ],
  Rejected: [
    {
      label: 'Nothing found',
      note: 'We went to the place and did not find this problem.',
      reason: 'no_problem_found',
    },
    {
      label: 'Unclear photo',
      note: 'We could not confirm this from the photo and details. Please send a new report with a clearer photo.',
      reason: 'not_enough_details',
    },
    {
      label: 'Outside our area',
      note: 'This looks to be outside our barangay, so we cannot act on this report. If the pin is wrong, please send a new report.',
      reason: 'outside_area',
    },
    {
      label: 'Not for the barangay',
      note: 'This is not something the barangay handles, so we cannot act on this report.',
      reason: 'not_barangay_concern',
    },
  ],
  'In Progress': [
    { label: 'Work started', note: 'Work on this has started.' },
    { label: 'Team told', note: 'Our team has been told about this.' },
  ],
  Resolved: [
    { label: 'Fixed', note: 'The work is done and the problem is fixed. Send a new report if it comes back.' },
    { label: 'Checked after work', note: 'We checked the place after the work and the problem is gone.' },
  ],
}

/**
 * The words to send. A phrase left as it is goes in English, whatever the screen shows, because residents' screens
 * translate it into their own language. Anything edited goes exactly as typed.
 */
export function storedNote(note: string, status: Status, t: (text: string) => string) {
  const text = note.trim()
  return NOTE_PHRASES[status]?.find(phrase => t(phrase.note) === text)?.note ?? text
}
