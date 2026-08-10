/**
 * Pipeline create / edit write patterns. Pipeline soft-delete lives in
 * `operator-save.ts` alongside the Operator mutations it cascades over; the
 * create + edit (name/description) paths are here.
 *
 * A Pipeline create/edit doesn't touch `operators` and so doesn't carry the
 * single-producer-per-Tag-key invariant the Operator paths do. It still runs
 * inside {@link withPipelineEditLock} (`BEGIN IMMEDIATE`) so the name-uniqueness
 * read-check (against `idx_pipelines_name_active`) and the write are atomic
 * against a concurrent create of the same name, and so every config mutation
 * goes through one locking helper. Each writes a `change_log` row per
 * data-model "Audit".
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { withPipelineEditLock } from './edit-lock.js'
import { NotFoundError } from './operator-save.js'

/** Thrown when a Pipeline name collides with a live Pipeline for the User. */
export class PipelineNameConflictError extends Error {
  override readonly name = 'PipelineNameConflictError'
  constructor(readonly pipelineName: string) {
    super(`A pipeline named '${pipelineName}' already exists`)
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

export interface CreatePipelineInput {
  readonly userId: number
  readonly name: string
  readonly description: string | null
  readonly actorUserId: number | null
}

/** Creates a Pipeline; returns its new id. */
export async function createPipeline(db: Kysely<Database>, input: CreatePipelineInput): Promise<number> {
  return withPipelineEditLock(db, async (tx) => {
    await assertNameFree(tx, input.userId, input.name, null)
    const ts = now()

    const inserted = await tx
      .insertInto('pipelines')
      .values({
        user_id: input.userId,
        name: input.name,
        description: input.description,
        created_at: ts,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('change_log')
      .values({
        user_id: input.userId,
        actor_user_id: input.actorUserId,
        entity_type: 'pipeline',
        entity_id: inserted.id,
        action: 'created',
        before_json: null,
        after_json: JSON.stringify({
          name: input.name,
          description: input.description,
        }),
        recorded_at: ts,
      })
      .execute()

    return inserted.id
  })
}

export interface EditPipelineInput {
  readonly pipelineId: number
  readonly name?: string
  readonly description?: string | null
  readonly actorUserId: number | null
}

/** Edits a Pipeline's name and/or description. */
export async function editPipeline(db: Kysely<Database>, input: EditPipelineInput): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const pipeline = await tx
      .selectFrom('pipelines')
      .select(['id', 'user_id', 'name', 'description'])
      .where('id', '=', input.pipelineId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!pipeline) {
      throw new NotFoundError(`Pipeline ${input.pipelineId} not found or deleted`)
    }

    if (input.name !== undefined && input.name !== pipeline.name) {
      await assertNameFree(tx, pipeline.user_id, input.name, input.pipelineId)
    }
    const ts = now()

    const before = {
      name: pipeline.name,
      description: pipeline.description,
    }

    await tx
      .updateTable('pipelines')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      })
      .where('id', '=', input.pipelineId)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: pipeline.user_id,
        actor_user_id: input.actorUserId,
        entity_type: 'pipeline',
        entity_id: input.pipelineId,
        action: 'updated',
        before_json: JSON.stringify(before),
        after_json: JSON.stringify({
          name: input.name ?? pipeline.name,
          description: input.description !== undefined ? input.description : pipeline.description,
        }),
        recorded_at: ts,
      })
      .execute()
  })
}

/**
 * Rejects a name that's already taken by a live Pipeline for the User. Mirrors
 * `idx_pipelines_name_active` (the partial unique index over `deleted_at IS
 * NULL`); `excludeId` lets an edit keep its own name.
 */
async function assertNameFree(
  tx: Kysely<Database>,
  userId: number,
  name: string,
  excludeId: number | null,
): Promise<void> {
  let q = tx
    .selectFrom('pipelines')
    .select('id')
    .where('user_id', '=', userId)
    .where('name', '=', name)
    .where('deleted_at', 'is', null)
  if (excludeId !== null) {
    q = q.where('id', '!=', excludeId)
  }
  const existing = await q.executeTakeFirst()
  if (existing) {
    throw new PipelineNameConflictError(name)
  }
}
