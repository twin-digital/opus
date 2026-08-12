import type { SourceState } from '@grinbox/shared'
import type { ColumnType, Generated, Kysely } from 'kysely'

/**
 * The Kysely `Database` interface for Grinbox's State DB — the one SQLite file
 * all persistent state lives in (d-dbjiycvl). One TS interface per table.
 *
 * Type-shape conventions used here:
 * - `Generated<number>` for surrogate integer PKs (rowid / AUTOINCREMENT):
 *   the value is assigned by SQLite on INSERT, so it is optional on insert and
 *   always present on select.
 * - `ColumnType<Select, Insert, Update>` where the three differ. The common
 *   case is `created_at`: required on INSERT, never UPDATEd (`never` update
 *   type). Snapshot columns on `triage_operator_runs` use the same pattern.
 * - `T | null` for nullable columns.
 * - `Buffer` for the encrypted `_enc` BLOB.
 *
 * Closed enums are typed as their string-literal unions (mirroring the schema
 * CHECK constraints); intentionally-open enums (`provider_type`, `kind`,
 * `entity_type`) are plain `string`.
 */

/** Unix seconds, set on INSERT, never updated. */
type CreatedAt = ColumnType<number, number, never>
/** Unix seconds, set on INSERT, updated on every later edit. */
type UpdatedAt = ColumnType<number, number, number>
/** Immutable snapshot column: set on INSERT, never updated. */
type Snapshot<T> = ColumnType<T, T, never>

export interface UsersTable {
  id: Generated<number>
  name: string
  email: string | null
  created_at: CreatedAt
  deleted_at: number | null
}

export interface AccountsTable {
  id: Generated<number>
  user_id: number
  name: string
  /** Display-badge glyph name (shared ACCOUNT_ICONS); null → default mail icon. */
  icon: string | null
  /** Display-badge color token (shared ACCOUNT_COLORS); null → neutral badge. */
  color: string | null
  /** Open enum: `gmail`; future `imap`. */
  provider_type: string
  active_pipeline_id: number | null
  settings_json: string
  poll_interval_seconds: ColumnType<number, number | undefined, number>
  last_polled_at: number | null
  last_history_cursor: string | null
  /** Unix seconds of the last source-state reconcile; null until the first. */
  last_reconciled_at: number | null
  created_at: CreatedAt
  deleted_at: number | null
}

export interface CredentialsTable {
  id: Generated<number>
  user_id: number
  account_id: number | null
  /** Open enum: `gmail_oauth`, `pushover`. */
  kind: string
  /** kind-specific JSON, encrypted at rest. */
  data_enc: Buffer
  created_at: CreatedAt
  updated_at: number | null
  deleted_at: number | null
}

export interface PipelinesTable {
  id: Generated<number>
  user_id: number
  name: string
  description: string | null
  created_at: CreatedAt
  deleted_at: number | null
}

export interface OperatorsTable {
  id: Generated<number>
  pipeline_id: number
  name: string
  type_key: string
  type_code_version: string
  config_json: string
  enabled: ColumnType<number, number, number>
  created_at: CreatedAt
  updated_at: UpdatedAt
  deleted_at: number | null
}

export interface OperatorCredentialReferencesTable {
  operator_id: number
  credential_id: number
}

export interface LimitsTable {
  id: Generated<number>
  user_id: number
  resource: string
  operation: string
  /** Closed enum (CHECK): `per_window` | `per_message`. */
  scope: 'per_window' | 'per_message'
  /**
   * Who put the cap there (CHECK). A `seeded` cap is grinbox's own backstop and
   * cannot be removed or loosened by anyone; a `user` cap layers over it and
   * comes off freely (d-qv5l66ya).
   */
  origin: LimitOrigin
  max_count: number
  window_seconds: number | null
  created_at: CreatedAt
}

/** Provenance of a cap: grinbox's own backstop, or one the user added. */
export type LimitOrigin = 'seeded' | 'user'

export interface LimitCountersWindowTable {
  limit_id: number
  window_start: number
  count: number
}

export interface LimitCountersMessageTable {
  limit_id: number
  message_id: number
  count: number
}

export interface MessagesTable {
  id: Generated<number>
  account_id: number
  backend_message_id: string
  backend_thread_id: string | null
  from_header: string | null
  to_header: string | null
  subject: string | null
  snippet: string | null
  body_text: string | null
  body_html: string | null
  received_at: number | null
  created_at: CreatedAt
  body_fetched_at: number | null
  headers_json: string | null
  /** Backend disposition; defaults to `present` on insert (see source-state migration). */
  source_state: ColumnType<SourceState, SourceState | undefined, SourceState>
  /** Unix seconds the state last changed; null until a transition is observed. */
  source_state_at: number | null
  /** Unix seconds the state was last confirmed against the backend; null until first sync. */
  source_synced_at: number | null
}

export interface TagsTable {
  triage_id: number
  operator_id: number
  key: string
  value: string
  created_at: CreatedAt
}

export interface CurrentTriagesTable {
  message_id: number
  pipeline_id: number
  triage_id: number
  /** Denormalized from triages.started_at. */
  triage_started_at: number
  updated_at: UpdatedAt
}

export interface TriagesTable {
  id: Generated<number>
  message_id: number
  pipeline_id: number
  /** Closed enum (CHECK). */
  triggered_by: 'message_arrival' | 'user_replay' | 'user_reset_and_replay' | 'pipeline_changed' | 'scheduled_replay'
  actor_user_id: number | null
  started_at: number
  ended_at: number | null
  /** Closed enum (CHECK): `running` | `completed` | `partial` | `failed`. */
  status: 'running' | 'completed' | 'partial' | 'failed'
  error_summary: string | null
}

export interface TriageOperatorRunsTable {
  triage_id: number
  operator_id: number
  message_id: number
  /** Snapshot at enqueue; never UPDATEd. */
  type_key: Snapshot<string>
  /** Snapshot at enqueue; never UPDATEd. */
  type_code_version: Snapshot<string>
  /** Snapshot of operators.config_json at enqueue; never UPDATEd. */
  op_config_json: Snapshot<string>
  /** Closed enum (CHECK). */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at: number | null
  finished_at: number | null
  duration_ms: number | null
  skip_reason: string | null
  error_summary: string | null
  resource_usage_json: string | null
  created_at: CreatedAt
}

export interface TriageEventsTable {
  triage_id: number
  operator_id: number
  sequence_num: number
  /**
   * Closed enum (CHECK). `resource_op_suppressed` is a cooldown-suppressed push's own
   * outcome kind beside succeeded / limited / failed (d-e9jslw4x); its
   * `details_json` carries the notification kind and the `(triage_id,
   * operator_id)` of the run whose push it deferred to.
   *
   * The two `pending_archive_*` kinds record the delayed Archive path on the
   * run that recorded it (d-41v9yqvh): `pending_archive_recorded` when the
   * Triage records the pending Archive (`details_json` carries `due_at` and
   * `delay_seconds`), `pending_archive_skipped` when the moment came and
   * nothing was called (`details_json` carries `reason`). The call itself, when
   * it is made, records under the ordinary `resource_op_*` kinds.
   */
  event_type:
    | 'tag_set'
    | 'resource_op_succeeded'
    | 'resource_op_limited'
    | 'resource_op_failed'
    | 'resource_op_suppressed'
    | 'pending_archive_recorded'
    | 'pending_archive_skipped'
  details_json: string | null
  recorded_at: number
}

/**
 * One attempted scheduled occurrence of a Digest delivery Operator on an
 * Account. The row doubles as the claim on its cron occurrence (UNIQUE
 * `(operator_id, account_id, scheduled_for)`) and as the persisted coverage /
 * outcome record. See the `digest_runs` migration for the full rationale.
 */
export interface DigestRunsTable {
  id: Generated<number>
  operator_id: number
  account_id: number
  /** The cron occurrence (Unix seconds) this run realizes. */
  scheduled_for: number
  /** Coverage window over `messages.created_at`: `(covers_from, covers_to]`. */
  covers_from: number
  covers_to: number
  /** Snapshot of operators.config_json at claim; never UPDATEd. */
  op_config_json: Snapshot<string>
  /** Closed enum (CHECK). */
  status: 'running' | 'completed' | 'failed'
  started_at: number
  finished_at: number | null
  /** Candidate Messages the digest covered; null until the run finishes. */
  message_count: number | null
  error_summary: string | null
  resource_usage_json: string | null
  /** Accumulated Resource-operation events (JSON array; feeds the Activity log). */
  events_json: string | null
}

/**
 * A notification kind's minimum interval — the user's per-kind cooldown
 * setting (d-k3wq81vn). One row per `(user_id, kind)`; the kind's name is
 * stored trimmed and matched character for character (d-p8xrn2ce). Removing
 * the cooldown deletes the row (d-t6mhv3aq).
 */
export interface NotificationCooldownsTable {
  id: Generated<number>
  user_id: number
  kind: string
  /** Whole seconds, CHECK >= 1, no ceiling (d-t6mhv3aq). */
  interval_seconds: number
  created_at: CreatedAt
}

/**
 * One delivered push that named a notification kind: what a later Notify run's
 * cooldown check reads to find the push it defers to (d-5amonj40). Pushes
 * naming no kind are not recorded here.
 */
export interface NotificationPushesTable {
  id: Generated<number>
  user_id: number
  kind: string
  triage_id: number
  operator_id: number
  sent_at: number
}

/**
 * What became of a pending Archive. `pending` is the standing one; every other
 * value is terminal and names the case of d-41v9yqvh or d-0tajzoy7 it met.
 *
 *  - `archived` — it came due and the Message left the inbox.
 *  - `already_departed` — it came due and the Message had already left; the
 *    mailbox was untouched.
 *  - `failed` — the archive call failed past its operation's retries. The retry
 *    is a re-triage (d-0tebpjex).
 *  - `cancelled` — a later settled Triage of the Message recorded none.
 *  - `superseded` — a later settled Triage recorded another, or the recording
 *    Triage recorded several and this was not the earliest due.
 *  - `abandoned` — its Pipeline or Account was deleted, so it never performs
 *    (d-s2kf8vjq).
 */
export type PendingArchiveStatus =
  'pending' | 'archived' | 'already_departed' | 'failed' | 'cancelled' | 'superseded' | 'abandoned'

/**
 * An Archive a Triage recorded for later (d-grcdd4ov). At most one row per
 * Message is `pending` — the one its latest settled Triage recorded, earliest
 * due where that Triage recorded several (d-0tajzoy7) — enforced by a partial
 * UNIQUE index. Settled rows stay so the outcome is readable beside the Triage
 * that recorded it.
 */
export interface PendingArchivesTable {
  id: Generated<number>
  message_id: number
  /** The Triage whose settled conclusion this pending Archive is. */
  triage_id: number
  /** The Archive Operator within that Triage whose run recorded it. */
  operator_id: number
  /** Unix seconds: the Message's take-in plus the Operator's `delay_seconds`. */
  due_at: number
  status: PendingArchiveStatus
  /** Unix seconds the row left `pending`; null while it stands. */
  settled_at: number | null
  created_at: CreatedAt
}

export interface ChangeLogTable {
  id: Generated<number>
  user_id: number
  actor_user_id: number | null
  /** Open enum: `pipeline` | `operator` | `account` | `limit` | `credential` | `cooldown`. */
  entity_type: string
  entity_id: number
  /** Closed enum (CHECK). */
  action: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled'
  before_json: string | null
  after_json: string | null
  recorded_at: number
}

/**
 * Migration bookkeeping. Kysely's `Migrator` owns this table and requires a
 * fixed `(name TEXT PK, timestamp TEXT NOT NULL)` shape, so the column is
 * `timestamp`. See migrator.ts for the bookkeeping note. Declared here only for
 * completeness / typed reads.
 */
export interface SchemaMigrationsTable {
  name: string
  timestamp: string
}

export interface Database {
  users: UsersTable
  accounts: AccountsTable
  credentials: CredentialsTable
  pipelines: PipelinesTable
  operators: OperatorsTable
  operator_credential_references: OperatorCredentialReferencesTable
  limits: LimitsTable
  limit_counters_window: LimitCountersWindowTable
  limit_counters_message: LimitCountersMessageTable
  messages: MessagesTable
  tags: TagsTable
  current_triages: CurrentTriagesTable
  triages: TriagesTable
  triage_operator_runs: TriageOperatorRunsTable
  triage_events: TriageEventsTable
  digest_runs: DigestRunsTable
  notification_cooldowns: NotificationCooldownsTable
  notification_pushes: NotificationPushesTable
  pending_archives: PendingArchivesTable
  change_log: ChangeLogTable
  schema_migrations: SchemaMigrationsTable
}

/** The typed connection handle used throughout the server. */
export type DB = Kysely<Database>
