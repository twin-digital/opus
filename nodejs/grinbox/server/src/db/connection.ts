import SqliteDatabase from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import type { Database } from './schema.js'

/**
 * Open the State DB at `path` and wrap it in a typed Kysely instance.
 *
 * The connection is opened once at Daemon startup and kept open for the process
 * lifetime (see architecture.md "State"). `better-sqlite3` is synchronous,
 * which matches the single-process workload.
 *
 * PRAGMAs:
 * - `journal_mode = WAL` — concurrent readers alongside the single writer.
 * - `foreign_keys = ON` — SQLite leaves FK enforcement off by default; the
 *   schema's ON DELETE actions and composite FKs depend on it being on.
 * - `busy_timeout = 5000` — wait up to 5s for a lock rather than failing
 *   immediately (matters under WAL when a checkpoint briefly holds a lock).
 * - `synchronous = NORMAL` — the recommended durability/throughput trade-off
 *   under WAL; safe against application crashes, only at risk on OS/power loss.
 *
 * `path` is supplied by the caller: the Daemon passes its configured DB path;
 * tests pass `:memory:` or a temp file.
 */
export function openDatabase(path: string): Kysely<Database> {
  const sqlite = new SqliteDatabase(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = NORMAL')

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  })
}

/**
 * Close the Kysely instance and its underlying better-sqlite3 connection.
 * Idempotent from the caller's perspective — call once on graceful shutdown.
 */
export async function closeDatabase(db: Kysely<Database>): Promise<void> {
  await db.destroy()
}
