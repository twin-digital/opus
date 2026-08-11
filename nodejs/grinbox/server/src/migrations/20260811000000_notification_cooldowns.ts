import { type Kysely, sql } from 'kysely'

/**
 * Notification kinds and cooldowns (increment 009). Forward-only, matching the
 * initial migration (no `down`).
 *
 *  - `notification_cooldowns` — the user's per-kind minimum interval
 *    (d-k3wq81vn): one row per `(user_id, kind)`, keyed by the kind's stored
 *    name and shared across every pipeline. The interval is whole seconds >= 1
 *    with no ceiling; removing the cooldown deletes the row, and a kind with no
 *    row has no cooldown (d-t6mhv3aq).
 *  - `notification_pushes` — one row per delivered push that named a kind: what
 *    a later Notify run's cooldown check reads to find the push it defers to
 *    (d-5amonj40). A push naming no kind is not recorded here — nothing groups
 *    it with any other operator's.
 *  - `triage_events.event_type` gains `resource_op_suppressed`, the suppression's own
 *    outcome kind beside succeeded / failed / skipped-by-limit (d-e9jslw4x).
 *    SQLite cannot alter a CHECK, so the table is rebuilt with foreign keys
 *    off, the ids carried across unchanged (same procedure as the
 *    `limit_origin` migration).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE notification_cooldowns (
      id               INTEGER PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id),
      kind             TEXT    NOT NULL CHECK (length(kind) > 0),
      interval_seconds INTEGER NOT NULL CHECK (interval_seconds >= 1),
      created_at       INTEGER NOT NULL,
      UNIQUE (user_id, kind)
    )
  `.execute(db)

  await sql`
    CREATE TABLE notification_pushes (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      kind        TEXT    NOT NULL,
      triage_id   INTEGER NOT NULL,
      operator_id INTEGER NOT NULL,
      sent_at     INTEGER NOT NULL
    )
  `.execute(db)
  await sql`
    CREATE INDEX idx_notification_pushes_kind
      ON notification_pushes (user_id, kind, sent_at DESC)
  `.execute(db)

  await sql`PRAGMA foreign_keys = OFF`.execute(db)
  try {
    await rebuildTriageEvents(db)
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db)
  }
}

async function rebuildTriageEvents(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE triage_events_new (
      triage_id     INTEGER NOT NULL,
      operator_id   INTEGER NOT NULL,
      sequence_num  INTEGER NOT NULL,
      event_type    TEXT    NOT NULL
        CHECK (event_type IN ('tag_set','resource_op_succeeded','resource_op_limited','resource_op_failed','resource_op_suppressed')),
      details_json  TEXT,
      recorded_at   INTEGER NOT NULL,
      PRIMARY KEY (triage_id, sequence_num),
      FOREIGN KEY (triage_id, operator_id)
        REFERENCES triage_operator_runs(triage_id, operator_id)
        ON DELETE CASCADE
    )
  `.execute(db)

  await sql`
    INSERT INTO triage_events_new (triage_id, operator_id, sequence_num, event_type, details_json, recorded_at)
    SELECT triage_id, operator_id, sequence_num, event_type, details_json, recorded_at FROM triage_events
  `.execute(db)

  await sql`DROP TABLE triage_events`.execute(db)
  await sql`ALTER TABLE triage_events_new RENAME TO triage_events`.execute(db)

  await sql`
    CREATE INDEX idx_resource_ops ON triage_events
      (event_type, recorded_at)
      WHERE event_type IN ('resource_op_succeeded',
                           'resource_op_limited',
                           'resource_op_failed',
                           'resource_op_suppressed')
  `.execute(db)
}
