import { type Kysely, sql } from 'kysely'

/**
 * Source-state tracking for `messages`. A Message row persists Grinbox's triage
 * history independently of whether the Message still lives in the backend inbox,
 * so the row is kept (never deleted) and instead carries the backend's current
 * disposition. The Inbox view defaults to `source_state = 'present'` (still in
 * the inbox) and can reveal the rest; see data-model.md "messages".
 *
 * Forward-only, matching the initial migration (no `down`).
 *
 *  - `source_state` — the backend disposition. `present` = in the inbox;
 *    `archived` = exists but out of the inbox; `trashed`/`spam` = in those
 *    folders; `deleted` = permanently gone from the backend. Existing rows
 *    default to `present` and are reconciled on the next poll.
 *  - `source_state_at` — Unix seconds the state last changed (NULL until a
 *    transition is observed).
 *  - `source_synced_at` — Unix seconds the state was last confirmed against the
 *    backend (NULL until the first delta/reconcile touches the row); drives the
 *    UI's freshness/confidence signal.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE messages ADD COLUMN source_state TEXT NOT NULL DEFAULT 'present'
      CHECK (source_state IN ('present','archived','trashed','spam','deleted'))
  `.execute(db)
  await sql`ALTER TABLE messages ADD COLUMN source_state_at INTEGER`.execute(db)
  await sql`ALTER TABLE messages ADD COLUMN source_synced_at INTEGER`.execute(db)

  // The Inbox list filters on (account, source_state) and orders by
  // received_at; this index covers the default `present` scope.
  await sql`
    CREATE INDEX messages_account_source_state_received
      ON messages (account_id, source_state, received_at DESC)
  `.execute(db)
}
