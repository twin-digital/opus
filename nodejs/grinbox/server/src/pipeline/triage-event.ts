import type { Database } from '../db/schema.js'

/** A `triage_events` row to record (sequence_num is assigned in-transaction). */
export interface TriageEventInput {
  readonly eventType: Database['triage_events']['event_type']
  readonly detailsJson: string | null
}
