/**
 * Cooldown create / edit / delete write patterns (d-k3wq81vn, d-t6mhv3aq). A
 * cooldown is the user's own setting through and through — unlike a Limit
 * there is no seeded row to protect, and removing one merely exposes the
 * seeded Limits binding underneath (d-6ptxams7).
 *
 * Every accepted change writes a `change_log` entry with `entity_type`
 * `'cooldown'` (d-w2fzk9bd), the same before/after + action + actor shape a
 * Limit change writes.
 *
 * The kind name is normalized here exactly as d-p8xrn2ce fixes it: trimmed of
 * surrounding whitespace, refused when empty or spanning more than one line,
 * and otherwise stored as typed. Two operators (or a cooldown and an operator)
 * share a kind exactly when the stored names match character for character.
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { NotFoundError } from '../pipeline/operator-save.js'

/** Thrown when a kind name is empty after trimming, or is not one line. */
export class InvalidKindNameError extends Error {
  override readonly name = 'InvalidKindNameError'
  constructor() {
    super('A notification kind is a non-empty single line of text.')
  }
}

/** Thrown when the user already has a cooldown for the kind. */
export class CooldownConflictError extends Error {
  override readonly name = 'CooldownConflictError'
  constructor(readonly kind: string) {
    super(`A cooldown for the kind '${kind}' already exists`)
  }
}

/**
 * Normalize a kind name per d-p8xrn2ce: trim surrounding whitespace, refuse
 * the empty result and anything spanning more than one line; keep the rest as
 * typed.
 */
export function normalizeKindName(raw: string): string {
  const kind = raw.trim()
  if (kind.length === 0 || /[\r\n]/.test(kind)) {
    throw new InvalidKindNameError()
  }
  return kind
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

export interface CreateCooldownInput {
  readonly userId: number
  /** The kind's name as typed; normalized here before storing. */
  readonly kind: string
  /** Whole seconds >= 1 — the route validated the shape. */
  readonly intervalSeconds: number
  readonly actorUserId: number | null
}

/** Sets a kind's interval; returns the new cooldown's id. */
export async function createCooldown(db: Kysely<Database>, input: CreateCooldownInput): Promise<number> {
  const kind = normalizeKindName(input.kind)
  return db.transaction().execute(async (tx) => {
    const existing = await tx
      .selectFrom('notification_cooldowns')
      .select('id')
      .where('user_id', '=', input.userId)
      .where('kind', '=', kind)
      .executeTakeFirst()
    if (existing) {
      throw new CooldownConflictError(kind)
    }
    const ts = now()

    const inserted = await tx
      .insertInto('notification_cooldowns')
      .values({
        user_id: input.userId,
        kind,
        interval_seconds: input.intervalSeconds,
        created_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('change_log')
      .values({
        user_id: input.userId,
        actor_user_id: input.actorUserId,
        entity_type: 'cooldown',
        entity_id: inserted.id,
        action: 'created',
        before_json: null,
        after_json: JSON.stringify({ kind, interval_seconds: input.intervalSeconds }),
        recorded_at: ts,
      })
      .execute()

    return inserted.id
  })
}

export interface EditCooldownInput {
  readonly cooldownId: number
  readonly intervalSeconds: number
  readonly actorUserId: number | null
}

/** Changes a cooldown's interval; the kind itself is fixed at create. */
export async function editCooldown(db: Kysely<Database>, input: EditCooldownInput): Promise<void> {
  return db.transaction().execute(async (tx) => {
    const cooldown = await tx
      .selectFrom('notification_cooldowns')
      .select(['id', 'user_id', 'kind', 'interval_seconds'])
      .where('id', '=', input.cooldownId)
      .executeTakeFirst()
    if (!cooldown) {
      throw new NotFoundError(`Cooldown ${input.cooldownId} not found`)
    }
    const ts = now()

    await tx
      .updateTable('notification_cooldowns')
      .set({ interval_seconds: input.intervalSeconds })
      .where('id', '=', input.cooldownId)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: cooldown.user_id,
        actor_user_id: input.actorUserId,
        entity_type: 'cooldown',
        entity_id: input.cooldownId,
        action: 'updated',
        before_json: JSON.stringify({ kind: cooldown.kind, interval_seconds: cooldown.interval_seconds }),
        after_json: JSON.stringify({ kind: cooldown.kind, interval_seconds: input.intervalSeconds }),
        recorded_at: ts,
      })
      .execute()
  })
}

/**
 * Removes a cooldown — a hard delete: a kind with no setting has no cooldown,
 * and the seeded Limits on the push resource still bind (d-6ptxams7). The
 * `change_log` `deleted` row carries the definition in `before_json`.
 */
export async function deleteCooldown(
  db: Kysely<Database>,
  cooldownId: number,
  actorUserId: number | null,
): Promise<void> {
  return db.transaction().execute(async (tx) => {
    const cooldown = await tx
      .selectFrom('notification_cooldowns')
      .select(['id', 'user_id', 'kind', 'interval_seconds'])
      .where('id', '=', cooldownId)
      .executeTakeFirst()
    if (!cooldown) {
      throw new NotFoundError(`Cooldown ${cooldownId} not found`)
    }
    const ts = now()

    await tx.deleteFrom('notification_cooldowns').where('id', '=', cooldownId).execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: cooldown.user_id,
        actor_user_id: actorUserId,
        entity_type: 'cooldown',
        entity_id: cooldownId,
        action: 'deleted',
        before_json: JSON.stringify({ kind: cooldown.kind, interval_seconds: cooldown.interval_seconds }),
        after_json: null,
        recorded_at: ts,
      })
      .execute()
  })
}
