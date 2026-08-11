import { z } from 'zod'

/**
 * Closed enums that the State DB schema CHECK-constrains, and the
 * intentionally-open enums it deliberately leaves unconstrained. A value the
 * user or a backend could add without grinbox changing — a provider type, a
 * credential kind — is open; a vocabulary grinbox itself fixes is closed.
 *
 * These mirror the schema's CHECK constraints exactly: drift between a CHECK
 * and the Zod enum here would let the UI/API accept a value the DB rejects (or
 * vice versa).
 */

// --- Closed enums (schema CHECK-constrained) ---

/** `triages.status` — system-level Triage lifecycle outcome. */
export const triageStatusSchema = z.enum(['running', 'completed', 'partial', 'failed'])
export type TriageStatus = z.infer<typeof triageStatusSchema>

/** `triage_operator_runs.status` — per-Operator-run state machine. */
export const operatorRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped'])
export type OperatorRunStatus = z.infer<typeof operatorRunStatusSchema>

/** `triages.triggered_by` — what caused the Triage to be enqueued. */
export const triggeredBySchema = z.enum([
  'message_arrival',
  'user_replay',
  'user_reset_and_replay',
  'pipeline_changed',
  'scheduled_replay',
])
export type TriggeredBy = z.infer<typeof triggeredBySchema>

/** `change_log.action` — the kind of config mutation being audited. */
export const changeLogActionSchema = z.enum(['created', 'updated', 'deleted', 'enabled', 'disabled'])
export type ChangeLogAction = z.infer<typeof changeLogActionSchema>

/**
 * `triage_events.event_type` — the chronological Triage-event kinds.
 * `resource_op_suppressed` is a cooldown-suppressed push (d-e9jslw4x): its own
 * outcome kind beside succeeded, failed, and limited; the event carries the
 * notification kind and the run whose push it deferred to.
 * `resource_op_skipped` is an operation the standing made unnecessary — a due
 * pending archive whose Message has already left the inbox (d-41v9yqvh): the
 * mailbox is untouched, and the outcome records against the run that recorded
 * the pending archive.
 */
export const triageEventTypeSchema = z.enum([
  'tag_set',
  'resource_op_succeeded',
  'resource_op_limited',
  'resource_op_failed',
  'resource_op_suppressed',
  'resource_op_skipped',
])
export type TriageEventType = z.infer<typeof triageEventTypeSchema>

/** `limits.scope` — whether a Limit is windowed or per-Message. */
export const limitScopeSchema = z.enum(['per_window', 'per_message'])
export type LimitScope = z.infer<typeof limitScopeSchema>

/**
 * `messages.source_state` — where a Message stands on the backend (d-jr86qq8b).
 * Grinbox keeps its own record whichever state the Message is in; browsing
 * surfaces filter on this and default to `present`, so a departed Message is
 * listed when asked for rather than always.
 */
export const sourceStateSchema = z.enum(['present', 'archived', 'trashed', 'spam', 'deleted'])
export type SourceState = z.infer<typeof sourceStateSchema>

// --- Intentionally-open enums (no schema CHECK) ---
//
// These are deliberately left as free strings so the listed future values can
// be added without a migration. The known-today values are documented inline
// but NOT enforced here — enforcing them would defeat the open-enum design.

/**
 * `accounts.provider_type`. Open so `imap` (and future backends) can be added
 * without a schema migration. Known today: `gmail`.
 */
export const providerTypeSchema = z.string()
export type ProviderType = z.infer<typeof providerTypeSchema>

/**
 * `credentials.kind`. Open so new notification-channel credential kinds can be
 * added without a migration. Known today: `gmail_oauth`, `pushover`.
 */
export const credentialKindSchema = z.string()
export type CredentialKind = z.infer<typeof credentialKindSchema>

/**
 * `change_log.entity_type`. Open so new configurable entity types can be
 * audited without a migration. Known today: `pipeline`, `operator`, `account`,
 * `limit`, `credential`, `cooldown` (d-w2fzk9bd).
 */
export const changeLogEntityTypeSchema = z.string()
export type ChangeLogEntityType = z.infer<typeof changeLogEntityTypeSchema>
