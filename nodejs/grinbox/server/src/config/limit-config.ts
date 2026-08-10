/**
 * Limit create / edit / hard-delete write patterns. Limits are the one entity
 * that hard-deletes rather than soft-deletes; their ephemeral counters CASCADE
 * away with the row.
 *
 * Every one of these routes refuses a `seeded` cap. d-qv5l66ya makes grinbox's
 * own caps the backstop — they cannot be removed or loosened by anyone — and
 * r-zmn2p7lf states the check as "read every surface the user configures for a
 * way to remove or loosen a cap grinbox itself seeded; none exists". These are
 * those surfaces, so the refusal lives here rather than in the routes above
 * them.
 *
 *  - {@link createLimit} — INSERT a `user` Limit; `change_log` `created`. It may
 *    layer over a seeded cap on the same operation: both then bind, and the
 *    first to deny denies.
 *  - {@link editLimit} — UPDATE `max_count` / `window_seconds` on a `user`
 *    Limit; `change_log` `updated`. The identity tuple
 *    `(resource, operation, scope)` is fixed at create — editing it would be a
 *    `UNIQUE` collision, so the route models such a change as delete + create.
 *  - {@link hardDeleteLimit} — `DELETE FROM limits` for a `user` Limit;
 *    `limit_counters_window` and `limit_counters_message` rows CASCADE-delete.
 *    The `change_log` `deleted` row carries the definition in `before_json`.
 *
 * Shape validation (scope ⇄ window_seconds coherence, positive `max_count`) is
 * the caller's job via `@grinbox/shared`'s `limitDefinitionSchema`; these helpers
 * assume an already-validated definition and own only the DB writes + audit.
 */

import type { LimitScope } from '@grinbox/shared'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { NotFoundError } from '../pipeline/operator-save.js'

/**
 * Thrown when a change would remove or loosen a cap grinbox seeded (d-qv5l66ya).
 * A user tightens an operation by adding a cap of their own over the seeded one,
 * which layers rather than replaces.
 */
export class SeededLimitError extends Error {
  override readonly name = 'SeededLimitError'
  constructor(readonly limitId: number) {
    super(
      `Limit ${limitId} is one grinbox seeded: it cannot be removed or loosened. ` +
        `Add a limit of your own on the same operation to bind it more tightly.`,
    )
  }
}

/** Thrown when a user Limit's `(resource, operation, scope)` already exists. */
export class LimitConflictError extends Error {
  override readonly name = 'LimitConflictError'
  constructor(
    readonly resource: string,
    readonly operation: string,
    readonly scope: string,
  ) {
    super(`A limit for ${resource}.${operation} (${scope}) already exists`)
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

export interface CreateLimitInput {
  readonly userId: number
  readonly resource: string
  readonly operation: string
  readonly scope: LimitScope
  readonly maxCount: number
  readonly windowSeconds: number | null
  readonly actorUserId: number | null
}

/** Creates a Limit; returns its new id. */
export async function createLimit(db: Kysely<Database>, input: CreateLimitInput): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const existing = await tx
      .selectFrom('limits')
      .select('id')
      .where('user_id', '=', input.userId)
      .where('resource', '=', input.resource)
      .where('operation', '=', input.operation)
      .where('scope', '=', input.scope)
      .where('origin', '=', 'user')
      .executeTakeFirst()
    if (existing) {
      throw new LimitConflictError(input.resource, input.operation, input.scope)
    }
    const ts = now()

    const inserted = await tx
      .insertInto('limits')
      .values({
        user_id: input.userId,
        resource: input.resource,
        operation: input.operation,
        scope: input.scope,
        origin: 'user',
        max_count: input.maxCount,
        window_seconds: input.windowSeconds,
        created_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('change_log')
      .values({
        user_id: input.userId,
        actor_user_id: input.actorUserId,
        entity_type: 'limit',
        entity_id: inserted.id,
        action: 'created',
        before_json: null,
        after_json: JSON.stringify(limitSnapshot(input)),
        recorded_at: ts,
      })
      .execute()

    return inserted.id
  })
}

export interface EditLimitInput {
  readonly limitId: number
  readonly maxCount: number
  readonly windowSeconds: number | null
  readonly actorUserId: number | null
}

/** Edits a Limit's `max_count` / `window_seconds`; writes a `change_log` row. */
export async function editLimit(db: Kysely<Database>, input: EditLimitInput): Promise<void> {
  return db.transaction().execute(async (tx) => {
    const limit = await tx
      .selectFrom('limits')
      .select(['id', 'user_id', 'resource', 'operation', 'scope', 'origin', 'max_count', 'window_seconds'])
      .where('id', '=', input.limitId)
      .executeTakeFirst()
    if (!limit) {
      throw new NotFoundError(`Limit ${input.limitId} not found`)
    }
    if (limit.origin === 'seeded') {
      throw new SeededLimitError(input.limitId)
    }
    const ts = now()

    const before = {
      resource: limit.resource,
      operation: limit.operation,
      scope: limit.scope,
      max_count: limit.max_count,
      window_seconds: limit.window_seconds,
    }

    await tx
      .updateTable('limits')
      .set({
        max_count: input.maxCount,
        window_seconds: input.windowSeconds,
      })
      .where('id', '=', input.limitId)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: limit.user_id,
        actor_user_id: input.actorUserId,
        entity_type: 'limit',
        entity_id: input.limitId,
        action: 'updated',
        before_json: JSON.stringify(before),
        after_json: JSON.stringify({
          ...before,
          max_count: input.maxCount,
          window_seconds: input.windowSeconds,
        }),
        recorded_at: ts,
      })
      .execute()
  })
}

/**
 * Hard-deletes a Limit (data-model "Limit hard-delete"). The counter rows
 * (`limit_counters_window`, `limit_counters_message`) CASCADE away via their FK.
 * The `change_log` `deleted` row captures the full definition in `before_json`.
 */
export async function hardDeleteLimit(
  db: Kysely<Database>,
  limitId: number,
  actorUserId: number | null,
): Promise<void> {
  return db.transaction().execute(async (tx) => {
    const limit = await tx
      .selectFrom('limits')
      .select(['id', 'user_id', 'resource', 'operation', 'scope', 'origin', 'max_count', 'window_seconds'])
      .where('id', '=', limitId)
      .executeTakeFirst()
    if (!limit) {
      throw new NotFoundError(`Limit ${limitId} not found`)
    }
    if (limit.origin === 'seeded') {
      throw new SeededLimitError(limitId)
    }
    const ts = now()

    await tx.deleteFrom('limits').where('id', '=', limitId).execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: limit.user_id,
        actor_user_id: actorUserId,
        entity_type: 'limit',
        entity_id: limitId,
        action: 'deleted',
        before_json: JSON.stringify({
          resource: limit.resource,
          operation: limit.operation,
          scope: limit.scope,
          max_count: limit.max_count,
          window_seconds: limit.window_seconds,
        }),
        after_json: null,
        recorded_at: ts,
      })
      .execute()
  })
}

function limitSnapshot(input: CreateLimitInput): Record<string, unknown> {
  return {
    resource: input.resource,
    operation: input.operation,
    scope: input.scope,
    max_count: input.maxCount,
    window_seconds: input.windowSeconds,
  }
}
