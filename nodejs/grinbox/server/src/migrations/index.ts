import type { Migration } from 'kysely'
import * as initialSchema from './20260601000000_initial_schema.js'
import * as messageSourceState from './20260602120000_message_source_state.js'
import * as accountLastReconciled from './20260602130000_account_last_reconciled.js'
import * as accountDisplay from './20260602140000_account_display.js'

/**
 * Static migration registry: migration name → module. The migrator builds its
 * `Migrator` from this map rather than from `FileMigrationProvider`, which reads
 * the migrations directory off disk at runtime. Under an ESM + `tsc`-to-`dist`
 * build that directory layout (and the `.js`/`.ts` extension dance it does) is
 * fragile; a statically-imported map is resolved by the bundler/loader and has
 * no runtime path dependency.
 *
 * Keys are the migration names recorded in `schema_migrations`. They must sort
 * lexicographically into application order — the timestamp prefix guarantees
 * this. Add new migrations here in order.
 */
export const migrations: Record<string, Migration> = {
  '20260601000000_initial_schema': initialSchema,
  '20260602120000_message_source_state': messageSourceState,
  '20260602130000_account_last_reconciled': accountLastReconciled,
  '20260602140000_account_display': accountDisplay,
}
