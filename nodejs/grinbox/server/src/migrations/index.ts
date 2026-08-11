import type { Migration } from 'kysely/migration'
import * as initialSchema from './20260601000000_initial_schema.js'
import * as messageSourceState from './20260602120000_message_source_state.js'
import * as accountLastReconciled from './20260602130000_account_last_reconciled.js'
import * as accountDisplay from './20260602140000_account_display.js'
import * as digestRuns from './20260603000000_digest_runs.js'
import * as mailResources from './20260604000000_mail_resources.js'
import * as limitOrigin from './20260605000000_limit_origin.js'
import * as notificationCooldowns from './20260811000000_notification_cooldowns.js'
import * as pendingArchives from './20260812000000_pending_archives.js'

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
  '20260603000000_digest_runs': digestRuns,
  '20260604000000_mail_resources': mailResources,
  '20260605000000_limit_origin': limitOrigin,
  '20260811000000_notification_cooldowns': notificationCooldowns,
  '20260812000000_pending_archives': pendingArchives,
}
