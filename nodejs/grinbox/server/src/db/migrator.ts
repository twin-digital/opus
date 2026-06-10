import { type Kysely, type MigrationProvider, Migrator } from 'kysely'
import { migrations } from '../migrations/index.js'
import type { Database } from './schema.js'

/**
 * In-code migration provider backed by the static `migrations` map (see
 * migrations/index.ts for why this is preferred over `FileMigrationProvider`).
 */
const provider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
}

/**
 * Run all pending migrations. Called by the Daemon at startup, before the State
 * DB is opened for normal operation (see data-model.md "Migrations"). Throws on
 * the first failure; the Daemon turns that into a non-zero exit (T0.4's
 * concern), and systemd restarts on its own schedule.
 *
 * Migration bookkeeping note: data-model.md specifies a `schema_migrations`
 * table with `(name, applied_at)`. Kysely's `Migrator` owns its bookkeeping
 * table and creates it with a fixed shape — `(name TEXT PK, timestamp TEXT NOT
 * NULL)` — so the column is `timestamp`, not `applied_at`. We honor the table
 * *name* (`migrationTableName: 'schema_migrations'`) but follow Kysely's
 * required column shape, since the Migrator both creates and reads that table.
 * Nothing else queries `applied_at`; the divergence is contained to this table.
 */
export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider,
    migrationTableName: 'schema_migrations',
    migrationLockTableName: 'schema_migrations_lock',
  })

  const { error, results } = await migrator.migrateToLatest()

  if (error) {
    const failed = results?.find((r) => r.status === 'Error')
    const detail = failed ? ` (failed at: ${failed.migrationName})` : ''
    throw new Error(`State DB migration failed${detail}`, { cause: error })
  }
}
