import { type Kysely, sql } from 'kysely'

/**
 * `accounts.last_reconciled_at` — Unix seconds of the last source-state reconcile
 * (a full inbox snapshot diffed against stored rows; d-jeyg1z1r). NULL until
 * the first reconcile, which the poll loop treats as "due now". Forward-only.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE accounts ADD COLUMN last_reconciled_at INTEGER`.execute(db)
}
