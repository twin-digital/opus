import { type Kysely, sql } from 'kysely'

/**
 * Per-Account display badge: `icon` (a glyph name) and `color` (a palette token),
 * picked in account settings and shown in the Inbox's account column + the
 * account list/detail. Both nullable — an unset icon renders the default mail
 * glyph and an unset color a neutral badge. Validated against the shared
 * ACCOUNT_ICONS / ACCOUNT_COLORS vocabularies at write time. Forward-only.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE accounts ADD COLUMN icon TEXT`.execute(db)
  await sql`ALTER TABLE accounts ADD COLUMN color TEXT`.execute(db)
}
