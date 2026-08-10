import { type Kysely, sql } from 'kysely'

/**
 * Give `limits` a provenance column, and widen its uniqueness so a user's cap
 * can layer over a seeded one.
 *
 * d-qv5l66ya: grinbox seeds a cap for every operation it caps and those seeded
 * caps cannot be removed or loosened by anyone; a user adds caps of their own on
 * top and may remove what they added, leaving the seeded cap standing; where
 * several bind one operation, the first to deny denies. Without `origin` nothing
 * distinguishes the two, so every route treated a seeded cap as the user's; and
 * with uniqueness on `(user_id, resource, operation, scope)` a user's cap on an
 * already-capped operation collided with the seeded row rather than layering
 * over it, which left editing grinbox's own cap as the only way to tighten one.
 *
 * The backfill reads the seeded set from `DEFAULT_LIMITS` at the version this
 * migration shipped, transcribed here rather than imported: a migration records
 * what the state looked like at a moment, and a later change to the seeded set
 * must not retroactively re-label rows this already classified. Reseeding
 * afterwards inserts any seeded cap the backfill did not find.
 *
 * SQLite cannot drop a table-level UNIQUE, so the table is rebuilt. The counter
 * tables reference `limits(id)` and the ids are carried across unchanged, so
 * in-flight window counts and per-message counters keep counting.
 */

/** The seeded `(resource, operation, scope)` tuples as of this migration. */
const SEEDED_AT_THIS_MIGRATION: readonly (readonly [string, string, string])[] = [
  ['pushover_api', 'send_notification', 'per_window'],
  ['pushover_api', 'send_notification', 'per_message'],
  ['mailbox', 'apply_category', 'per_window'],
  ['mailbox', 'archive', 'per_window'],
  ['mailbox', 'fetch_body', 'per_window'],
  ['mail_sender', 'send_message', 'per_window'],
  ['mail_sender', 'send_message', 'per_message'],
  ['llm_bedrock', 'invoke_model', 'per_window'],
]

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE limits_new (
      id              INTEGER PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      resource        TEXT    NOT NULL,
      operation       TEXT    NOT NULL,
      scope           TEXT    NOT NULL CHECK (scope IN ('per_window', 'per_message')),
      origin          TEXT    NOT NULL CHECK (origin IN ('seeded', 'user')),
      max_count       INTEGER NOT NULL CHECK (max_count > 0),
      window_seconds  INTEGER,
      created_at      INTEGER NOT NULL,
      UNIQUE (user_id, resource, operation, scope, origin),
      CHECK ((scope = 'per_window' AND window_seconds IS NOT NULL AND window_seconds > 0)
          OR (scope = 'per_message' AND window_seconds IS NULL))
    )
  `.execute(db)

  await sql`
    INSERT INTO limits_new (id, user_id, resource, operation, scope, origin, max_count, window_seconds, created_at)
    SELECT id, user_id, resource, operation, scope, 'user', max_count, window_seconds, created_at FROM limits
  `.execute(db)

  for (const [resource, operation, scope] of SEEDED_AT_THIS_MIGRATION) {
    await sql`
      UPDATE limits_new SET origin = 'seeded'
      WHERE resource = ${resource} AND operation = ${operation} AND scope = ${scope}
    `.execute(db)
  }

  await sql`DROP TABLE limits`.execute(db)
  await sql`ALTER TABLE limits_new RENAME TO limits`.execute(db)
}
