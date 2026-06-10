/**
 * Operator-save write patterns (S2): create / edit / enable / disable /
 * soft-delete, plus Credential soft-delete and Pipeline soft-delete. Each runs
 * inside {@link withPipelineEditLock} (`BEGIN IMMEDIATE`) per the data-model
 * "Write patterns".
 *
 * The Operator mutations share one read-validate-write skeleton:
 *  1. Read the Pipeline's enabled Operators' `(operator_id, type_key,
 *     config_json)`.
 *  2. Apply the proposed change to that snapshot (substitute / add / drop the
 *     target Operator, or flip its enabled bit).
 *  3. Validate the *post-state* via {@link validatePipeline}.
 *  4. On failure: throw (the lock rolls back); on success: perform the mutation,
 *     reconcile `operator_credential_references`, write a `change_log` row.
 *
 * `type_code_version` is captured from the currently-deployed code at create and
 * refreshed on edit (pipeline-runtime.md "Operator-type code version changes").
 * Runnable types read it from the server's behavioral registry
 * (`currentCodeVersion`). A *declared-but-not-yet-runnable* type (e.g.
 * `digest_delivery`) is intentionally still saveable — its config validates structurally
 * and its `operator_credential_references` must be reconciled (data-model
 * `operator_credential_references` / credential-refs.ts) before its `run` lands.
 * It captures the built-in starting `code_version` `'1'`; the row simply fails
 * the runtime runnability recheck at execution until the type is implemented.
 */

import { type OperatorTypeKey, operatorTypeKeySchema } from '@twin-digital/grinbox-shared'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { extractCredentialRefsFromConfigJson } from '../operators/credential-refs.js'
import { type ImplementedTypeKey, currentCodeVersion, getOperatorType } from '../operators/registry.js'
import { withPipelineEditLock } from './edit-lock.js'
import { type OperatorForValidation, type ValidationError, validatePipeline } from './validation.js'

/** Thrown when a save's post-state fails Pipeline validation. */
export class PipelineValidationError extends Error {
  override readonly name = 'PipelineValidationError'
  constructor(readonly errors: readonly ValidationError[]) {
    super(`Pipeline validation failed: ${errors.map((e) => e.message).join('; ')}`)
  }
}

/** Thrown when a save targets an Operator/Pipeline/Credential that isn't found. */
export class NotFoundError extends Error {
  override readonly name = 'NotFoundError'
}

/** Thrown when a Credential soft-delete is blocked by live Operator references. */
export class CredentialInUseError extends Error {
  override readonly name = 'CredentialInUseError'
  constructor(readonly operatorIds: readonly number[]) {
    super(`Credential is referenced by Operator(s): ${operatorIds.join(', ')}`)
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Reads the post-change enabled set the validator needs. `pipelineId` scopes to
 * the Pipeline; only non-soft-deleted, enabled Operators participate in
 * validation.
 */
async function readEnabledOperators(tx: Kysely<Database>, pipelineId: number): Promise<OperatorForValidation[]> {
  const rows = await tx
    .selectFrom('operators')
    .select(['id', 'type_key', 'config_json'])
    .where('pipeline_id', '=', pipelineId)
    .where('enabled', '=', 1)
    .where('deleted_at', 'is', null)
    .execute()
  return rows.map((r) => ({
    operator_id: r.id,
    type_key: r.type_key,
    config_json: r.config_json,
  }))
}

function assertValid(operators: readonly OperatorForValidation[]): void {
  const result = validatePipeline(operators)
  if (!result.ok) {
    throw new PipelineValidationError(result.errors)
  }
}

/**
 * Reconciles `operator_credential_references` against the credential IDs an
 * Operator's `config_json` references: DELETE all current rows for the Operator,
 * then INSERT the current set. (A full replace is simplest and correct; the
 * sets are tiny.) Soft-deleted/disabled Operators still count as references per
 * the data-model, so this runs for enable/disable/edit alike — only
 * Operator-soft-delete clears the rows entirely.
 */
async function reconcileCredentialRefs(
  tx: Kysely<Database>,
  operatorId: number,
  typeKey: OperatorTypeKey,
  configJson: string,
): Promise<void> {
  await tx.deleteFrom('operator_credential_references').where('operator_id', '=', operatorId).execute()
  const credentialIds = extractCredentialRefsFromConfigJson(typeKey, configJson)
  if (credentialIds.length > 0) {
    await tx
      .insertInto('operator_credential_references')
      .values(
        [...new Set(credentialIds)].map((credential_id) => ({
          operator_id: operatorId,
          credential_id,
        })),
      )
      .execute()
  }
}

async function pipelineUserId(tx: Kysely<Database>, pipelineId: number): Promise<number> {
  const row = await tx.selectFrom('pipelines').select('user_id').where('id', '=', pipelineId).executeTakeFirst()
  if (!row) {
    throw new NotFoundError(`Pipeline ${pipelineId} not found`)
  }
  return row.user_id
}

/**
 * Resolves the `type_code_version` to capture for a `type_key`. Runnable types
 * report their deployed `code_version` via the behavioral registry. A
 * declared-but-not-yet-runnable type has no deployed runtime to query, so it
 * captures the built-in starting version `'1'` (registry.ts convention) — the
 * row is saveable now and fails the runtime runnability recheck until its `run`
 * lands.
 */
function resolveCodeVersion(typeKey: OperatorTypeKey): string {
  if (!getOperatorType(typeKey)) {
    return '1'
  }
  return currentCodeVersion(typeKey as ImplementedTypeKey)
}

// --- Create ---

export interface CreateOperatorInput {
  readonly pipelineId: number
  readonly name: string
  readonly typeKey: string
  readonly configJson: string
  readonly enabled: boolean
  readonly actorUserId: number | null
}

/** Creates a new Operator; returns its new id. */
export async function createOperator(db: Kysely<Database>, input: CreateOperatorInput): Promise<number> {
  const typeKey = operatorTypeKeySchema.parse(input.typeKey)
  return withPipelineEditLock(db, async (tx) => {
    const userId = await pipelineUserId(tx, input.pipelineId)
    const codeVersion = resolveCodeVersion(typeKey)
    const ts = now()

    // Post-state: existing enabled set plus this Operator (if it'll be enabled).
    // Use a placeholder id (0) that can't collide with real rowids for the
    // validation snapshot; the real id is assigned by the INSERT below.
    const enabled = await readEnabledOperators(tx, input.pipelineId)
    if (input.enabled) {
      enabled.push({
        operator_id: 0,
        type_key: typeKey,
        config_json: input.configJson,
      })
    }
    assertValid(enabled)

    const inserted = await tx
      .insertInto('operators')
      .values({
        pipeline_id: input.pipelineId,
        name: input.name,
        type_key: typeKey,
        type_code_version: codeVersion,
        config_json: input.configJson,
        enabled: input.enabled ? 1 : 0,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await reconcileCredentialRefs(tx, inserted.id, typeKey, input.configJson)

    await tx
      .insertInto('change_log')
      .values({
        user_id: userId,
        actor_user_id: input.actorUserId,
        entity_type: 'operator',
        entity_id: inserted.id,
        action: 'created',
        before_json: null,
        after_json: operatorAfterJson({
          name: input.name,
          type_key: typeKey,
          type_code_version: codeVersion,
          config_json: input.configJson,
          enabled: input.enabled,
        }),
        recorded_at: ts,
      })
      .execute()

    return inserted.id
  })
}

// --- Edit ---

export interface EditOperatorInput {
  readonly operatorId: number
  readonly name?: string
  readonly configJson: string
  readonly actorUserId: number | null
}

/** Edits an existing Operator's `config_json` (and optionally name). */
export async function editOperator(db: Kysely<Database>, input: EditOperatorInput): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const op = await loadOperator(tx, input.operatorId)
    const typeKey = operatorTypeKeySchema.parse(op.type_key)
    const codeVersion = resolveCodeVersion(typeKey)
    const userId = await pipelineUserId(tx, op.pipeline_id)
    const ts = now()

    const enabled = await readEnabledOperators(tx, op.pipeline_id)
    if (op.enabled === 1) {
      // Substitute the edited config into the snapshot.
      const target = enabled.find((e) => e.operator_id === input.operatorId)
      if (target) {
        const idx = enabled.indexOf(target)
        enabled[idx] = {
          operator_id: input.operatorId,
          type_key: typeKey,
          config_json: input.configJson,
        }
      }
    }
    assertValid(enabled)

    const before = operatorAfterJson({
      name: op.name,
      type_key: op.type_key,
      type_code_version: op.type_code_version,
      config_json: op.config_json,
      enabled: op.enabled === 1,
    })

    await tx
      .updateTable('operators')
      .set({
        config_json: input.configJson,
        type_code_version: codeVersion,
        ...(input.name !== undefined ? { name: input.name } : {}),
        updated_at: ts,
      })
      .where('id', '=', input.operatorId)
      .execute()

    await reconcileCredentialRefs(tx, input.operatorId, typeKey, input.configJson)

    await tx
      .insertInto('change_log')
      .values({
        user_id: userId,
        actor_user_id: input.actorUserId,
        entity_type: 'operator',
        entity_id: input.operatorId,
        action: 'updated',
        before_json: before,
        after_json: operatorAfterJson({
          name: input.name ?? op.name,
          type_key: op.type_key,
          type_code_version: codeVersion,
          config_json: input.configJson,
          enabled: op.enabled === 1,
        }),
        recorded_at: ts,
      })
      .execute()
  })
}

// --- Enable / disable ---

/** Enables or disables an Operator; `action` distinguishes it in `change_log`. */
export async function setOperatorEnabled(
  db: Kysely<Database>,
  operatorId: number,
  enabled: boolean,
  actorUserId: number | null,
): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const op = await loadOperator(tx, operatorId)
    const userId = await pipelineUserId(tx, op.pipeline_id)
    const ts = now()

    const current = await readEnabledOperators(tx, op.pipeline_id)
    // Compute the post-state enabled set.
    const post = current.filter((e) => e.operator_id !== operatorId)
    if (enabled) {
      post.push({
        operator_id: operatorId,
        type_key: op.type_key,
        config_json: op.config_json,
      })
    }
    assertValid(post)

    const before = operatorAfterJson({
      name: op.name,
      type_key: op.type_key,
      type_code_version: op.type_code_version,
      config_json: op.config_json,
      enabled: op.enabled === 1,
    })

    await tx
      .updateTable('operators')
      .set({ enabled: enabled ? 1 : 0, updated_at: ts })
      .where('id', '=', operatorId)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: userId,
        actor_user_id: actorUserId,
        entity_type: 'operator',
        entity_id: operatorId,
        action: enabled ? 'enabled' : 'disabled',
        before_json: before,
        after_json: operatorAfterJson({
          name: op.name,
          type_key: op.type_key,
          type_code_version: op.type_code_version,
          config_json: op.config_json,
          enabled,
        }),
        recorded_at: ts,
      })
      .execute()
  })
}

// --- Soft-delete ---

/** Soft-deletes an Operator; clears its credential references. */
export async function softDeleteOperator(
  db: Kysely<Database>,
  operatorId: number,
  actorUserId: number | null,
): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const op = await loadOperator(tx, operatorId)
    const userId = await pipelineUserId(tx, op.pipeline_id)
    const ts = now()

    // Post-state: the enabled set without this Operator.
    const post = (await readEnabledOperators(tx, op.pipeline_id)).filter((e) => e.operator_id !== operatorId)
    assertValid(post)

    const before = operatorAfterJson({
      name: op.name,
      type_key: op.type_key,
      type_code_version: op.type_code_version,
      config_json: op.config_json,
      enabled: op.enabled === 1,
    })

    await tx.updateTable('operators').set({ deleted_at: ts, updated_at: ts }).where('id', '=', operatorId).execute()

    // A soft-deleted Operator no longer uses its Credentials (data-model
    // "Operator soft-delete"): drop its junction rows so they stop pinning the
    // Credential against soft-delete.
    await tx.deleteFrom('operator_credential_references').where('operator_id', '=', operatorId).execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: userId,
        actor_user_id: actorUserId,
        entity_type: 'operator',
        entity_id: operatorId,
        action: 'deleted',
        before_json: before,
        after_json: null,
        recorded_at: ts,
      })
      .execute()
  })
}

// --- Credential soft-delete ---

/**
 * Soft-deletes a Credential, blocked if any live `operator_credential_references`
 * point at it (data-model "Credential soft-delete" — the FK doesn't fire on
 * soft-delete, so the gate is an explicit pre-UPDATE query). `change_log`
 * captures non-secret metadata only (kind, account_id), never `data_enc`.
 */
export async function softDeleteCredential(
  db: Kysely<Database>,
  credentialId: number,
  actorUserId: number | null,
): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const refs = await tx
      .selectFrom('operator_credential_references')
      .select('operator_id')
      .where('credential_id', '=', credentialId)
      .execute()
    if (refs.length > 0) {
      throw new CredentialInUseError(refs.map((r) => r.operator_id))
    }

    const cred = await tx
      .selectFrom('credentials')
      .select(['user_id', 'kind', 'account_id', 'created_at', 'updated_at'])
      .where('id', '=', credentialId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!cred) {
      throw new NotFoundError(`Credential ${credentialId} not found or already deleted`)
    }
    const ts = now()

    await tx.updateTable('credentials').set({ deleted_at: ts, updated_at: ts }).where('id', '=', credentialId).execute()

    const metadata = {
      kind: cred.kind,
      account_id: cred.account_id,
      created_at: cred.created_at,
      updated_at: cred.updated_at,
    }
    await tx
      .insertInto('change_log')
      .values({
        user_id: cred.user_id,
        actor_user_id: actorUserId,
        entity_type: 'credential',
        entity_id: credentialId,
        action: 'deleted',
        before_json: JSON.stringify(metadata),
        after_json: null,
        recorded_at: ts,
      })
      .execute()
  })
}

// --- Pipeline soft-delete ---

/**
 * Soft-deletes a Pipeline and cascades per data-model "Pipeline soft-delete":
 * cascade Operator soft-delete, free their credential references, NULL out
 * referencing Accounts' `active_pipeline_id`, DELETE `current_triages` for the
 * Pipeline. Historical `triages`/runs/tags/events are intentionally kept.
 */
export async function softDeletePipeline(
  db: Kysely<Database>,
  pipelineId: number,
  actorUserId: number | null,
): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const pipeline = await tx
      .selectFrom('pipelines')
      .select(['id', 'user_id', 'name'])
      .where('id', '=', pipelineId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!pipeline) {
      throw new NotFoundError(`Pipeline ${pipelineId} not found or already deleted`)
    }
    const ts = now()

    await tx.updateTable('pipelines').set({ deleted_at: ts }).where('id', '=', pipelineId).execute()

    await tx
      .updateTable('operators')
      .set({ deleted_at: ts, updated_at: ts })
      .where('pipeline_id', '=', pipelineId)
      .where('deleted_at', 'is', null)
      .execute()

    await tx
      .deleteFrom('operator_credential_references')
      .where('operator_id', 'in', (qb) => qb.selectFrom('operators').select('id').where('pipeline_id', '=', pipelineId))
      .execute()

    await tx
      .updateTable('accounts')
      .set({ active_pipeline_id: null })
      .where('active_pipeline_id', '=', pipelineId)
      .execute()

    await tx.deleteFrom('current_triages').where('pipeline_id', '=', pipelineId).execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: pipeline.user_id,
        actor_user_id: actorUserId,
        entity_type: 'pipeline',
        entity_id: pipelineId,
        action: 'deleted',
        before_json: JSON.stringify({ name: pipeline.name }),
        after_json: null,
        recorded_at: ts,
      })
      .execute()
  })
}

// --- Helpers ---

interface OperatorRow {
  readonly id: number
  readonly pipeline_id: number
  readonly name: string
  readonly type_key: string
  readonly type_code_version: string
  readonly config_json: string
  readonly enabled: number
}

async function loadOperator(tx: Kysely<Database>, operatorId: number): Promise<OperatorRow> {
  const op = await tx
    .selectFrom('operators')
    .select(['id', 'pipeline_id', 'name', 'type_key', 'type_code_version', 'config_json', 'enabled'])
    .where('id', '=', operatorId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  if (!op) {
    throw new NotFoundError(`Operator ${operatorId} not found or deleted`)
  }
  return op
}

/** The non-secret Operator snapshot recorded in `change_log` before/after. */
function operatorAfterJson(snapshot: {
  name: string
  type_key: string
  type_code_version: string
  config_json: string
  enabled: boolean
}): string {
  return JSON.stringify(snapshot)
}
