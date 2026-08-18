import { type Kysely, sql } from 'kysely'

/**
 * The generic IMAP backend (increment 013). Forward-only, matching the initial
 * migration (no `down`).
 *
 *  - `accounts.capabilities_json` — what the Account's backend declared it can
 *    carry, re-read at every poll and read back everywhere else (d-bzw8qoiy).
 *  - `accounts.paused_reason` — why polling stopped; a password the server
 *    refused as the credential pauses the Account until the user fixes it
 *    (d-v4mejzw5).
 *  - `messages.imap_folder` / `imap_uidvalidity` / `imap_uid` — where an IMAP
 *    Message currently is (d-k4nt8zbu). Its `backend_message_id` is the
 *    Message-ID header, which follows it across folders; the triple does not,
 *    so it is rewritten on every move.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE accounts ADD COLUMN capabilities_json TEXT`.execute(db)
  await sql`ALTER TABLE accounts ADD COLUMN paused_reason TEXT`.execute(db)

  await sql`ALTER TABLE messages ADD COLUMN imap_folder TEXT`.execute(db)
  await sql`ALTER TABLE messages ADD COLUMN imap_uidvalidity INTEGER`.execute(db)
  await sql`ALTER TABLE messages ADD COLUMN imap_uid INTEGER`.execute(db)

  // The stored-location lookup a poll resolves before falling back to a
  // Message-ID search across the Account's four folders (d-k4nt8zbu).
  await sql`
    CREATE INDEX idx_messages_imap_location
      ON messages (account_id, imap_folder, imap_uidvalidity, imap_uid)
      WHERE imap_folder IS NOT NULL
  `.execute(db)
}
