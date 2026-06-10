import { type Kysely, sql } from 'kysely'

/**
 * Initial schema — the full Grinbox State DB, transcribed column-for-column
 * from data-model.md. Forward-only; no `down` (see data-model.md "Migrations").
 *
 * The DDL is issued as raw `sql` statements rather than via Kysely's schema
 * builder. Almost every table here carries a constraint the builder can't
 * express fluently — composite PKs, composite FKs, conditional CHECKs, and the
 * `WHERE`-clause partial unique indexes — so a single transcription of the
 * documented DDL is both more faithful and more readable than a half-builder,
 * half-`sql` mix. Each statement is executed in document order; `up` runs
 * inside Kysely's per-migration transaction.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // --- users ---
  await sql`
    CREATE TABLE users (
      id          INTEGER PRIMARY KEY,
      name        TEXT    NOT NULL,
      email       TEXT    UNIQUE,
      created_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    )
  `.execute(db)

  // --- accounts ---
  await sql`
    CREATE TABLE accounts (
      id                     INTEGER PRIMARY KEY,
      user_id                INTEGER NOT NULL REFERENCES users(id),
      name                   TEXT    NOT NULL,
      provider_type          TEXT    NOT NULL,
      active_pipeline_id     INTEGER REFERENCES pipelines(id),
      settings_json          TEXT    NOT NULL,
      poll_interval_seconds  INTEGER NOT NULL DEFAULT 600
        CHECK (poll_interval_seconds BETWEEN 60 AND 86400),
      last_polled_at         INTEGER,
      last_history_cursor    TEXT,
      created_at             INTEGER NOT NULL,
      deleted_at             INTEGER
    )
  `.execute(db)

  // --- credentials ---
  await sql`
    CREATE TABLE credentials (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      account_id  INTEGER REFERENCES accounts(id),
      kind        TEXT    NOT NULL,
      data_enc    BLOB    NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER,
      deleted_at  INTEGER
    )
  `.execute(db)

  // --- pipelines ---
  await sql`
    CREATE TABLE pipelines (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      name        TEXT    NOT NULL,
      description TEXT,
      created_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    )
  `.execute(db)

  // --- operators ---
  await sql`
    CREATE TABLE operators (
      id                 INTEGER PRIMARY KEY,
      pipeline_id        INTEGER NOT NULL REFERENCES pipelines(id),
      name               TEXT    NOT NULL,
      type_key           TEXT    NOT NULL,
      type_code_version  TEXT    NOT NULL,
      config_json        TEXT    NOT NULL,
      enabled            INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
      deleted_at         INTEGER
    )
  `.execute(db)

  // --- operator_credential_references ---
  await sql`
    CREATE TABLE operator_credential_references (
      operator_id    INTEGER NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
      credential_id  INTEGER NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
      PRIMARY KEY (operator_id, credential_id)
    )
  `.execute(db)

  // --- limits ---
  await sql`
    CREATE TABLE limits (
      id              INTEGER PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      resource        TEXT    NOT NULL,
      operation       TEXT    NOT NULL,
      scope           TEXT    NOT NULL CHECK (scope IN ('per_window', 'per_message')),
      max_count       INTEGER NOT NULL CHECK (max_count > 0),
      window_seconds  INTEGER,
      created_at      INTEGER NOT NULL,
      UNIQUE (user_id, resource, operation, scope),
      CHECK ((scope = 'per_window' AND window_seconds IS NOT NULL AND window_seconds > 0)
          OR (scope = 'per_message' AND window_seconds IS NULL))
    )
  `.execute(db)

  // --- limit_counters_window ---
  await sql`
    CREATE TABLE limit_counters_window (
      limit_id      INTEGER PRIMARY KEY REFERENCES limits(id) ON DELETE CASCADE,
      window_start  INTEGER NOT NULL,
      count         INTEGER NOT NULL
    )
  `.execute(db)

  // --- limit_counters_message ---
  await sql`
    CREATE TABLE limit_counters_message (
      limit_id    INTEGER NOT NULL REFERENCES limits(id) ON DELETE CASCADE,
      message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      count       INTEGER NOT NULL,
      PRIMARY KEY (limit_id, message_id)
    )
  `.execute(db)

  // --- messages ---
  await sql`
    CREATE TABLE messages (
      id                  INTEGER PRIMARY KEY,
      account_id          INTEGER NOT NULL REFERENCES accounts(id),
      backend_message_id  TEXT    NOT NULL,
      backend_thread_id   TEXT,
      from_header         TEXT,
      to_header           TEXT,
      subject             TEXT,
      snippet             TEXT,
      body_text           TEXT,
      body_html           TEXT,
      received_at         INTEGER,
      created_at          INTEGER NOT NULL,
      body_fetched_at     INTEGER,
      headers_json        TEXT,
      UNIQUE (account_id, backend_message_id)
    )
  `.execute(db)

  // --- triages ---
  await sql`
    CREATE TABLE triages (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id     INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      pipeline_id    INTEGER NOT NULL REFERENCES pipelines(id),
      triggered_by   TEXT    NOT NULL
        CHECK (triggered_by IN ('message_arrival','user_replay','user_reset_and_replay','pipeline_changed','scheduled_replay')),
      actor_user_id  INTEGER REFERENCES users(id),
      started_at     INTEGER NOT NULL,
      ended_at       INTEGER,
      status         TEXT    NOT NULL
        CHECK (status IN ('running','completed','partial','failed')),
      error_summary  TEXT,
      CHECK ((status = 'running' AND ended_at IS NULL)
          OR (status IN ('completed','partial','failed') AND ended_at IS NOT NULL))
    )
  `.execute(db)

  // --- triage_operator_runs ---
  // type_key, type_code_version, op_config_json are snapshots, never UPDATE.
  await sql`
    CREATE TABLE triage_operator_runs (
      triage_id            INTEGER NOT NULL REFERENCES triages(id) ON DELETE CASCADE,
      operator_id          INTEGER NOT NULL REFERENCES operators(id),
      message_id           INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      type_key             TEXT    NOT NULL, -- snapshot, never UPDATE
      type_code_version    TEXT    NOT NULL, -- snapshot, never UPDATE
      op_config_json       TEXT    NOT NULL, -- snapshot, never UPDATE
      status               TEXT    NOT NULL
        CHECK (status IN ('pending','running','completed','failed','skipped')),
      started_at           INTEGER,
      finished_at          INTEGER,
      duration_ms          INTEGER,
      skip_reason          TEXT,
      error_summary        TEXT,
      resource_usage_json  TEXT,
      created_at           INTEGER NOT NULL,
      PRIMARY KEY (triage_id, operator_id),
      CHECK ((status IN ('pending','running') AND finished_at IS NULL)
          OR (status IN ('completed','failed','skipped') AND finished_at IS NOT NULL))
    )
  `.execute(db)

  // --- tags ---
  // Composite FK is load-bearing: it must stay composite (see data-model.md).
  await sql`
    CREATE TABLE tags (
      triage_id    INTEGER NOT NULL,
      operator_id  INTEGER NOT NULL,
      key          TEXT    NOT NULL,
      value        TEXT    NOT NULL,
      created_at   INTEGER NOT NULL,
      PRIMARY KEY (triage_id, key),
      FOREIGN KEY (triage_id, operator_id)
        REFERENCES triage_operator_runs(triage_id, operator_id)
        ON DELETE CASCADE
    )
  `.execute(db)

  // --- current_triages ---
  await sql`
    CREATE TABLE current_triages (
      message_id         INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      pipeline_id        INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      triage_id          INTEGER NOT NULL REFERENCES triages(id) ON DELETE CASCADE,
      triage_started_at  INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
      PRIMARY KEY (message_id, pipeline_id)
    )
  `.execute(db)

  // --- triage_events ---
  // Composite FK is load-bearing: it must stay composite (see data-model.md).
  await sql`
    CREATE TABLE triage_events (
      triage_id     INTEGER NOT NULL,
      operator_id   INTEGER NOT NULL,
      sequence_num  INTEGER NOT NULL,
      event_type    TEXT    NOT NULL
        CHECK (event_type IN ('tag_set','resource_op_succeeded','resource_op_limited','resource_op_failed')),
      details_json  TEXT,
      recorded_at   INTEGER NOT NULL,
      PRIMARY KEY (triage_id, sequence_num),
      FOREIGN KEY (triage_id, operator_id)
        REFERENCES triage_operator_runs(triage_id, operator_id)
        ON DELETE CASCADE
    )
  `.execute(db)

  // --- change_log ---
  await sql`
    CREATE TABLE change_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      actor_user_id  INTEGER REFERENCES users(id),
      entity_type    TEXT    NOT NULL,
      entity_id      INTEGER NOT NULL,
      action         TEXT    NOT NULL
        CHECK (action IN ('created','updated','deleted','enabled','disabled')),
      before_json    TEXT,
      after_json     TEXT,
      recorded_at    INTEGER NOT NULL
    )
  `.execute(db)

  // --- partial unique indexes (name-uniqueness scoped to non-deleted rows) ---
  await sql`
    CREATE UNIQUE INDEX idx_accounts_name_active
      ON accounts(user_id, name)
      WHERE deleted_at IS NULL
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX idx_credentials_active_account
      ON credentials(user_id, kind, account_id)
      WHERE deleted_at IS NULL AND account_id IS NOT NULL
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX idx_credentials_active_user
      ON credentials(user_id, kind)
      WHERE deleted_at IS NULL AND account_id IS NULL
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX idx_pipelines_name_active
      ON pipelines(user_id, name)
      WHERE deleted_at IS NULL
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX idx_operators_name_active
      ON operators(pipeline_id, name)
      WHERE deleted_at IS NULL
  `.execute(db)

  // --- query indexes (data-model.md "Indexes") ---
  await sql`
    CREATE INDEX idx_op_runs_pending ON triage_operator_runs
      (status, created_at)
      WHERE status = 'pending'
  `.execute(db)

  await sql`
    CREATE INDEX idx_triages_message_started
      ON triages(message_id, started_at DESC)
  `.execute(db)

  await sql`
    CREATE INDEX idx_resource_ops ON triage_events
      (event_type, recorded_at)
      WHERE event_type IN ('resource_op_succeeded',
                           'resource_op_limited',
                           'resource_op_failed')
  `.execute(db)

  await sql`
    CREATE INDEX idx_messages_account_received
      ON messages(account_id, received_at DESC)
  `.execute(db)

  await sql`
    CREATE INDEX idx_current_triages_pipeline
      ON current_triages(pipeline_id, message_id)
  `.execute(db)

  await sql`
    CREATE INDEX idx_accounts_polling
      ON accounts(last_polled_at)
      WHERE deleted_at IS NULL AND active_pipeline_id IS NOT NULL
  `.execute(db)

  await sql`
    CREATE INDEX idx_change_log_entity
      ON change_log(entity_type, entity_id, recorded_at DESC)
  `.execute(db)
}
