/**
 * Account update + soft-delete write patterns (data-model "User changes an
 * Account's active Pipeline" and "Account soft-delete").
 *
 *  - {@link updateAccount} — the deferred helper that sets `active_pipeline_id`
 *    and/or `poll_interval_seconds`. The `poll_interval_seconds` value is bounded
 *    [60, 86400] to match the table CHECK; an out-of-range value is rejected in
 *    app code (with a structured error) before the write so the route can return
 *    a clean 4xx rather than surfacing a CHECK violation.
 *  - {@link softDeleteAccount} — sets `deleted_at` and cascades per data-model:
 *    its `gmail_oauth`/notification credentials are soft-deleted in the same
 *    transaction; Messages + Triage history remain (forensic); polling stops via
 *    the `idx_accounts_polling` deleted-filter.
 *
 * Both run inside a single transaction and write a `change_log` row. They don't
 * touch `operators`, so they use a plain transaction rather than
 * `withPipelineEditLock` (no single-producer invariant is in play).
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { NotFoundError } from '../pipeline/operator-save.js'

/** The inclusive bounds the `accounts.poll_interval_seconds` CHECK enforces. */
export const POLL_INTERVAL_MIN_SECONDS = 60
export const POLL_INTERVAL_MAX_SECONDS = 86_400

/** Thrown when a proposed `poll_interval_seconds` is outside [60, 86400]. */
export class PollIntervalOutOfRangeError extends Error {
  override readonly name = 'PollIntervalOutOfRangeError'
  constructor(readonly value: number) {
    super(
      `poll_interval_seconds must be between ${POLL_INTERVAL_MIN_SECONDS} and ${POLL_INTERVAL_MAX_SECONDS} (got ${value})`,
    )
  }
}

/** Thrown when a proposed `active_pipeline_id` isn't a live Pipeline. */
export class PipelineNotAssignableError extends Error {
  override readonly name = 'PipelineNotAssignableError'
  constructor(readonly pipelineId: number) {
    super(`Pipeline ${pipelineId} not found or deleted`)
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

export interface UpdateAccountInput {
  readonly accountId: number
  /**
   * When present, sets `active_pipeline_id` (use `null` to unassign). Omit the
   * field to leave the assignment unchanged.
   */
  readonly activePipelineId?: number | null
  /** When present, sets `poll_interval_seconds` (bounded [60, 86400]). */
  readonly pollIntervalSeconds?: number
  /** When present, sets the display name. */
  readonly name?: string
  /** When present, sets the display icon (`null` clears → default glyph). */
  readonly icon?: string | null
  /** When present, sets the display color (`null` clears → neutral badge). */
  readonly color?: string | null
  readonly actorUserId: number | null
}

/**
 * Updates an Account's `active_pipeline_id` and/or `poll_interval_seconds`.
 * Validates the cadence bound and (when assigning a Pipeline) that the target
 * Pipeline is live before writing; writes a `change_log` row.
 */
export async function updateAccount(db: Kysely<Database>, input: UpdateAccountInput): Promise<void> {
  if (
    input.pollIntervalSeconds !== undefined &&
    (input.pollIntervalSeconds < POLL_INTERVAL_MIN_SECONDS || input.pollIntervalSeconds > POLL_INTERVAL_MAX_SECONDS)
  ) {
    throw new PollIntervalOutOfRangeError(input.pollIntervalSeconds)
  }

  return db.transaction().execute(async (tx) => {
    const account = await tx
      .selectFrom('accounts')
      .select(['id', 'user_id', 'name', 'icon', 'color', 'active_pipeline_id', 'poll_interval_seconds'])
      .where('id', '=', input.accountId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!account) {
      throw new NotFoundError(`Account ${input.accountId} not found or deleted`)
    }

    if (input.activePipelineId !== undefined && input.activePipelineId !== null) {
      const pipeline = await tx
        .selectFrom('pipelines')
        .select('id')
        .where('id', '=', input.activePipelineId)
        .where('user_id', '=', account.user_id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst()
      if (!pipeline) {
        throw new PipelineNotAssignableError(input.activePipelineId)
      }
    }

    const ts = now()
    const before = {
      name: account.name,
      icon: account.icon,
      color: account.color,
      active_pipeline_id: account.active_pipeline_id,
      poll_interval_seconds: account.poll_interval_seconds,
    }

    await tx
      .updateTable('accounts')
      .set({
        ...(input.activePipelineId !== undefined ? { active_pipeline_id: input.activePipelineId } : {}),
        ...(input.pollIntervalSeconds !== undefined ? { poll_interval_seconds: input.pollIntervalSeconds } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      })
      .where('id', '=', input.accountId)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: account.user_id,
        actor_user_id: input.actorUserId,
        entity_type: 'account',
        entity_id: input.accountId,
        action: 'updated',
        before_json: JSON.stringify(before),
        after_json: JSON.stringify({
          name: input.name ?? account.name,
          icon: input.icon !== undefined ? input.icon : account.icon,
          color: input.color !== undefined ? input.color : account.color,
          active_pipeline_id:
            input.activePipelineId !== undefined ? input.activePipelineId : account.active_pipeline_id,
          poll_interval_seconds: input.pollIntervalSeconds ?? account.poll_interval_seconds,
        }),
        recorded_at: ts,
      })
      .execute()
  })
}

/**
 * Soft-deletes an Account and cascades per data-model "Account soft-delete":
 * soft-delete its live `credentials` in the same transaction. Messages + Triage
 * history are intentionally kept (forensic); polling stops via the
 * `idx_accounts_polling` deleted-filter.
 */
export async function softDeleteAccount(
  db: Kysely<Database>,
  accountId: number,
  actorUserId: number | null,
): Promise<void> {
  return db.transaction().execute(async (tx) => {
    const account = await tx
      .selectFrom('accounts')
      .select(['id', 'user_id', 'name'])
      .where('id', '=', accountId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!account) {
      throw new NotFoundError(`Account ${accountId} not found or deleted`)
    }
    const ts = now()

    await tx.updateTable('accounts').set({ deleted_at: ts }).where('id', '=', accountId).execute()

    await tx
      .updateTable('credentials')
      .set({ deleted_at: ts, updated_at: ts })
      .where('account_id', '=', accountId)
      .where('deleted_at', 'is', null)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: account.user_id,
        actor_user_id: actorUserId,
        entity_type: 'account',
        entity_id: accountId,
        action: 'deleted',
        before_json: JSON.stringify({ name: account.name }),
        after_json: null,
        recorded_at: ts,
      })
      .execute()
  })
}
