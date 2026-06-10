import { type Kysely, sql } from 'kysely'
import type { Database } from '../db/schema.js'

/**
 * Runs `fn` inside a single `BEGIN IMMEDIATE` SQLite transaction and returns its
 * result, committing on success and rolling back on any thrown error.
 *
 * ## Why `BEGIN IMMEDIATE` (load-bearing)
 *
 * Several State-DB invariants are app-enforced, not DB-enforced — chief among
 * them **single-producer-per-Tag-key** (data-model.md "What this schema does not
 * enforce"). The enforcement is a read-validate-write: read the Pipeline's
 * enabled Operators, validate the proposed post-change set, then write. For that
 * sequence to actually hold the invariant it must be atomic against any other
 * writer; otherwise two concurrent edits could each validate against a pre-state
 * where the other change hasn't landed, both pass, and both commit — producing
 * the impossible state of two Operators claiming the same output Tag key.
 *
 * SQLite's default `BEGIN` (DEFERRED) takes no write lock until the first write
 * statement, so the *read* phase runs unprotected and the race above is open.
 * `BEGIN IMMEDIATE` acquires the RESERVED lock at transaction start, before the
 * read, serializing the whole read-validate-write against any other writer: a
 * second writer blocks (up to `busy_timeout`) until the first commits, then
 * re-reads the committed post-state and validates correctly.
 *
 * Every mutation path that touches `operators` (create / edit / enable /
 * disable / soft-delete), Credential soft-delete, and Pipeline soft-delete goes
 * through this helper so the locking requirement is structural at the code
 * level rather than a convention each call site must remember.
 *
 * ## Connection pinning
 *
 * Kysely's `db.connection().execute(cb)` pins one underlying better-sqlite3
 * connection for the duration of `cb`. The `BEGIN IMMEDIATE`, the callback's
 * statements, and the COMMIT/ROLLBACK all run on that same pinned connection —
 * which is what makes the transaction coherent. The pinned handle is passed to
 * `fn`; callers must use it (not the outer `db`) for every statement inside the
 * lock.
 */
export async function withPipelineEditLock<T>(
  db: Kysely<Database>,
  fn: (tx: Kysely<Database>) => Promise<T>,
): Promise<T> {
  return db.connection().execute(async (conn) => {
    await sql`BEGIN IMMEDIATE`.execute(conn)
    try {
      const result = await fn(conn)
      await sql`COMMIT`.execute(conn)
      return result
    } catch (err) {
      await sql`ROLLBACK`.execute(conn)
      throw err
    }
  })
}
