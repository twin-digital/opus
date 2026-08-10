import { type Kysely, sql } from 'kysely'

/**
 * Rename the mail Resource/operation names in `limits` to the backend-neutral
 * split: the single Gmail-shaped `gmail_api` Resource becomes `mailbox`
 * (message-store operations, with `apply_label` renamed `apply_category`) and
 * `mail_sender` (`send_message`). Forward-only.
 *
 * Only `limits` is rewritten: its `resource`/`operation` columns drive live
 * enforcement (`checkAndConsumeLimits` matches attempted operations against
 * them by name), so rows left under the old names would silently stop capping
 * anything. The `limit_counters_window` / `limit_counters_message` tables key
 * by `limit_id` and follow the rewritten rows unchanged — in-flight window
 * counts keep counting.
 *
 * Historical records that carry the old names are left as-is deliberately:
 * `triage_events.details_json`, `triage_operator_runs.resource_usage_json`,
 * and `digest_runs` error text are a log of what happened at the time, read
 * only for display — nothing matches on them for enforcement or dispatch.
 * Pending `triage_operator_runs` snapshots need no rewrite either: a snapshot
 * carries only `type_key` / `type_code_version` / `op_config_json`, and the
 * executor re-derives the Contract's Resource declarations from the
 * code-resident registry at run time.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE limits
    SET resource = 'mailbox', operation = 'apply_category'
    WHERE resource = 'gmail_api' AND operation = 'apply_label'
  `.execute(db)
  await sql`
    UPDATE limits
    SET resource = 'mail_sender'
    WHERE resource = 'gmail_api' AND operation = 'send_message'
  `.execute(db)
  await sql`
    UPDATE limits
    SET resource = 'mailbox'
    WHERE resource = 'gmail_api'
  `.execute(db)
}
