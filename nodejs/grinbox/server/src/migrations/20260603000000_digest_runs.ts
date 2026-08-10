import { type Kysely, sql } from 'kysely'

/**
 * `digest_runs` — one row per attempted scheduled occurrence of a Digest
 * delivery Operator on an Account (see data-model.md "digest_runs" and
 * pipeline-runtime.md "Digest scheduler"). The row is both the **claim** and
 * the **record**:
 *
 *  - The UNIQUE `(operator_id, account_id, scheduled_for)` index makes the
 *    INSERT the atomic claim on a cron occurrence — two racing scheduler ticks
 *    computing the same due occurrence can't both fire it, so a digest is
 *    never double-sent.
 *  - `covers_from`/`covers_to` persist the coverage window (over
 *    `messages.created_at`, ingestion time). The next run's `covers_from` is
 *    the latest *completed* run's `covers_to` — a failed run does not advance
 *    the watermark, so the following occurrence covers the union.
 *  - `op_config_json` snapshots the Operator config at claim, mirroring
 *    `triage_operator_runs.op_config_json` (in-flight runs are insulated from
 *    concurrent edits; forensic views see the exact config that produced the
 *    digest).
 *  - `events_json` carries the metered clients' accumulated Resource-operation
 *    events. Digest runs happen outside any Triage, so these can't go to
 *    `triage_events` (its composite FK requires a Triage run); the Activity
 *    feed reads them from here instead.
 *
 * Forward-only, matching the initial migration (no `down`).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE digest_runs (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id          INTEGER NOT NULL REFERENCES operators(id),
      account_id           INTEGER NOT NULL REFERENCES accounts(id),
      scheduled_for        INTEGER NOT NULL,
      covers_from          INTEGER NOT NULL,
      covers_to            INTEGER NOT NULL,
      op_config_json       TEXT    NOT NULL,  -- snapshot, never UPDATE
      status               TEXT    NOT NULL CHECK (status IN ('running','completed','failed')),
      started_at           INTEGER NOT NULL,
      finished_at          INTEGER,
      message_count        INTEGER,
      error_summary        TEXT,
      resource_usage_json  TEXT,
      events_json          TEXT,
      CHECK ((status = 'running' AND finished_at IS NULL)
          OR (status IN ('completed','failed') AND finished_at IS NOT NULL))
    )
  `.execute(db)

  // The claim: one attempt per cron occurrence per (Operator, Account).
  await sql`
    CREATE UNIQUE INDEX idx_digest_runs_occurrence
      ON digest_runs(operator_id, account_id, scheduled_for)
  `.execute(db)

  // Watermark lookup: latest completed run's covers_to for an (Operator,
  // Account); also serves the run-history view most-recent-first.
  await sql`
    CREATE INDEX idx_digest_runs_watermark
      ON digest_runs(operator_id, account_id, status, covers_to DESC)
  `.execute(db)
}
