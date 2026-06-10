import type { ColumnType, Generated, Kysely } from 'kysely'

/**
 * The Kysely `Database` interface for Grinbox's State DB. One TS interface per
 * table; column types transcribe data-model.md exactly.
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
  max_count: number
  window_seconds: number | null
  created_at: CreatedAt
}

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

/** Backend disposition of a Message (CHECK-constrained; see `messages.source_state`). */
export type SourceState = 'present' | 'archived' | 'trashed' | 'spam' | 'deleted'

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
  /** Closed enum (CHECK). */
  event_type: 'tag_set' | 'resource_op_succeeded' | 'resource_op_limited' | 'resource_op_failed'
  details_json: string | null
  recorded_at: number
}

export interface ChangeLogTable {
  id: Generated<number>
  user_id: number
  actor_user_id: number | null
  /** Open enum: `pipeline` | `operator` | `account` | `limit` | `credential`. */
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
 * `timestamp` rather than data-model.md's `applied_at`. See migrator.ts for the
 * reconciliation note. Declared here only for completeness / typed reads.
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
  change_log: ChangeLogTable
  schema_migrations: SchemaMigrationsTable
}

/** The typed connection handle used throughout the server. */
export type DB = Kysely<Database>
