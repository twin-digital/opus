/**
 * Limit create / edit / hard-delete write patterns (data-model "Limits" and
 * "Limit hard-delete"). Limits are the one entity that hard-deletes rather than
 * soft-deletes; their ephemeral counters CASCADE away with the row.
 *
 *  - {@link createLimit} — INSERT a Limit for the User; `change_log` `created`.
 *  - {@link editLimit} — UPDATE `max_count` / `window_seconds` (the policy
 *    knobs); `change_log` `updated`. The identity tuple
 *    `(resource, operation, scope)` is fixed at create — editing it would be an
 *    `UNIQUE` collision with a different Limit, so the route models a change of
 *    resource/operation/scope as delete + create, not an edit.
 *  - {@link hardDeleteLimit} — `DELETE FROM limits`; `limit_counters_window` and
 *    `limit_counters_message` rows CASCADE-delete (FK `ON DELETE CASCADE`). The
 *    `change_log` `deleted` row carries the Limit definition in `before_json`.
 *
 * Shape validation (scope ⇄ window_seconds coherence, positive `max_count`) is
 * the caller's job via `@twin-digital/grinbox-shared`'s `limitDefinitionSchema`; these helpers
 * assume an already-validated definition and own only the DB writes + audit.
 */

import type { LimitScope } from '@twin-digital/grinbox-shared'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { NotFoundError } from '../pipeline/operator-save.js'

/** Thrown when a Limit's `(resource, operation, scope)` already exists. */
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
      .select(['id', 'user_id', 'resource', 'operation', 'scope', 'max_count', 'window_seconds'])
      .where('id', '=', input.limitId)
      .executeTakeFirst()
    if (!limit) {
      throw new NotFoundError(`Limit ${input.limitId} not found`)
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
      .select(['id', 'user_id', 'resource', 'operation', 'scope', 'max_count', 'window_seconds'])
      .where('id', '=', limitId)
      .executeTakeFirst()
    if (!limit) {
      throw new NotFoundError(`Limit ${limitId} not found`)
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
