import { type Kysely, sql } from 'kysely'

/**
 * Delayed archiving (increment 011). Forward-only, matching the initial
 * migration (no `down`).
 *
 *  - `pending_archives` — the Archive an earlier Triage recorded and grinbox
 *    still owes the Message (d-grcdd4ov). A Message holds at most one standing
 *    row (the partial UNIQUE index below), the one its latest settled Triage
 *    recorded (d-0tajzoy7); `status` carries what became of it, so a settled
 *    row stays readable beside the Triage that recorded it (d-41v9yqvh).
 *  - `triage_events.event_type` gains `pending_archive_recorded` and
 *    `pending_archive_skipped`, so what the delayed path did is readable on the
 *    run that recorded it beside the `resource_op_*` outcomes of the call
 *    itself. SQLite cannot alter a CHECK, so the table is rebuilt with foreign
 *    keys off, the rows carried across unchanged (the same procedure as the
 *    `notification_cooldowns` migration).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE pending_archives (
      id          INTEGER PRIMARY KEY,
      message_id  INTEGER NOT NULL REFERENCES messages(id),
      triage_id   INTEGER NOT NULL REFERENCES triages(id),
      operator_id INTEGER NOT NULL,
      due_at      INTEGER NOT NULL,
      status      TEXT    NOT NULL
        CHECK (status IN ('pending','archived','already_departed','failed','cancelled','superseded','abandoned')),
      settled_at  INTEGER,
      created_at  INTEGER NOT NULL
    )
  `.execute(db)

  // At most one standing pending Archive per Message (d-0tajzoy7). Settled rows
  // are outside the index, so a Message accumulates history freely.
  await sql`
    CREATE UNIQUE INDEX idx_pending_archives_standing
      ON pending_archives (message_id)
      WHERE status = 'pending'
  `.execute(db)

  // The heartbeat's due sweep: standing rows whose moment has passed.
  await sql`
    CREATE INDEX idx_pending_archives_due
      ON pending_archives (due_at)
      WHERE status = 'pending'
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
        CHECK (event_type IN ('tag_set','resource_op_succeeded','resource_op_limited','resource_op_failed','resource_op_suppressed','pending_archive_recorded','pending_archive_skipped')),
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
