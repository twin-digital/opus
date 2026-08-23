/**
 * The `/api` write router: the mutating routes the web UI calls to edit
 * Pipelines/Operators, assign Pipelines to Accounts, replay Messages, and manage
 * Limits + the notification Credential.
 *
 * Every route delegates to a documented write-pattern helper
 * (`pipeline/operator-save.ts`, `pipeline/pipeline-config.ts`,
 * `config/*`, `pipeline/triage-enqueue.ts`) — the routes own request validation,
 * acting-User resolution, and HTTP status/error-body mapping; they never inline
 * SQL or re-implement the locking / `change_log` / ref-reconciliation the helpers
 * already do.
 *
 * Validation: request bodies are validated with `@hono/zod-validator`; Operator
 * config bodies are validated per `type_key` via `operatorConfigSchemas`.
 * Helper-thrown validation failures (collision, cycle, dangling input, bad
 * config, conflicts, out-of-range cadence, credential-in-use) map to a 4xx with
 * a structured `{ error: { code, message, details? } }` body via
 * {@link mapWriteError}; not-found maps to 404. This is the contract the UI reads.
 *
 * A successful save carries `warnings`: the capabilities some Account cannot
 * carry, the Operators needing them, and the Accounts lacking them. A
 * configuration is never refused for naming an operation an Account cannot carry
 * (d-qzxvoph1) — the write succeeds and the warning is what the user meets.
 *
 * Single-User MVP (no auth): the acting/owning `user_id` and `actor_user_id` are
 * resolved from the single seeded User via {@link resolveActingUserId}, the same
 * way the read routes assume one User.
 */

import {
  ACCOUNT_COLORS,
  ACCOUNT_ICONS,
  type ApiErrorBody,
  type OperatorTypeKey,
  cooldownIntervalSecondsSchema,
  limitDefinitionSchema,
  operatorConfigSchemas,
  operatorTypeKeySchema,
} from '@grinbox/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { softDeleteAccount, updateAccount } from '../../config/account-config.js'
import { createCooldown, deleteCooldown, editCooldown } from '../../config/cooldown-config.js'
import { storePushoverCredential } from '../../config/credential-store.js'
import { createLimit, editLimit, hardDeleteLimit } from '../../config/limit-config.js'
import {
  NotFoundError,
  createOperator,
  editOperator,
  setOperatorEnabled,
  softDeleteCredential,
  softDeleteOperator,
  softDeletePipeline,
} from '../../pipeline/operator-save.js'
import { createPipeline, editPipeline } from '../../pipeline/pipeline-config.js'
import { enqueueTriage } from '../../pipeline/triage-enqueue.js'
import { capabilityWarnings, pipelineOfOperator } from '../../pipeline/capability-warnings.js'
import { type ApiDeps, resolveActingUserId } from './deps.js'
import { mapWriteError } from './write-errors.js'

/** The capability warnings for the Pipeline an Operator belongs to. */
async function warningsForOperator(deps: ApiDeps, operatorId: number) {
  const pipelineId = await pipelineOfOperator(deps.db, operatorId)
  return pipelineId === null ? [] : capabilityWarnings(deps.db, pipelineId)
}

const idParam = z.object({ id: z.coerce.number().int().positive() })

const createPipelineBody = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
})

const editPipelineBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, {
    message: 'at least one of name or description is required',
  })

const createOperatorBody = z.object({
  name: z.string().min(1),
  type_key: operatorTypeKeySchema,
  // `config` is validated per type_key by `validateOperatorConfig` below; kept
  // as an unknown object here so the zod-validator pass doesn't reject before the
  // type-aware validation runs.
  config: z.unknown(),
  enabled: z.boolean().default(true),
})

const editOperatorBody = z.object({
  name: z.string().min(1).optional(),
  config: z.unknown(),
})

const updateAccountBody = z
  .object({
    active_pipeline_id: z.number().int().positive().nullable().optional(),
    poll_interval_seconds: z.number().int().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    // Display badge: validated against the shared closed vocabularies. `null`
    // clears the field back to the default glyph / neutral badge.
    icon: z.enum(ACCOUNT_ICONS).nullable().optional(),
    color: z.enum(ACCOUNT_COLORS).nullable().optional(),
  })
  .refine(
    (b) =>
      b.active_pipeline_id !== undefined ||
      b.poll_interval_seconds !== undefined ||
      b.name !== undefined ||
      b.icon !== undefined ||
      b.color !== undefined,
    { message: 'at least one updatable field is required' },
  )

const createLimitBody = limitDefinitionSchema

const editLimitBody = z.object({
  max_count: z.number().int().positive(),
  window_seconds: z.number().int().positive().nullable(),
})

// A cooldown is created from the shared `{ kind, interval_seconds }` pair
// (d-l6bbgp05, d-t6mhv3aq). The kind arrives raw here: its trim/single-line
// normalization lives in `cooldown-config.ts` so a bad name maps to the
// structured `invalid_kind_name` refusal (d-u2rotm38, d-p8xrn2ce). The kind is
// fixed at create — changing it is delete + create (d-7c6u5nfn).
const createCooldownBody = z.object({
  kind: z.string(),
  interval_seconds: cooldownIntervalSecondsSchema,
})

const editCooldownBody = z.object({
  interval_seconds: cooldownIntervalSecondsSchema,
})

const createCredentialBody = z.object({
  // Only `pushover` is supported through this route (OAuth credentials are
  // written by the `/oauth` flow, not here).
  kind: z.literal('pushover'),
  app_token: z.string().min(1),
  user_key: z.string().min(1),
})

/**
 * Validate an Operator `config` body against its `type_key` schema, returning a
 * serialized `config_json`. Throws `z.ZodError` on a bad config — caught and
 * mapped to a 400 by {@link mapWriteError}.
 */
function validateOperatorConfig(typeKey: OperatorTypeKey, config: unknown): string {
  const schema = operatorConfigSchemas[typeKey]
  const parsed = schema.parse(config)
  return JSON.stringify(parsed)
}

export function createWriteRoutes(deps: ApiDeps) {
  return (
    new Hono()
      // --- Pipelines ---
      .post('/api/pipelines', zValidator('json', createPipelineBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const body = c.req.valid('json')
        try {
          const id = await createPipeline(deps.db, {
            userId,
            name: body.name,
            description: body.description ?? null,
            actorUserId: userId,
          })
          return c.json({ id }, 201)
        } catch (err) {
          return handle(c, err)
        }
      })
      .patch('/api/pipelines/:id', zValidator('param', idParam), zValidator('json', editPipelineBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        try {
          await editPipeline(deps.db, {
            pipelineId: id,
            name: body.name,
            description: body.description,
            actorUserId: userId,
          })
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })
      .delete('/api/pipelines/:id', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await softDeletePipeline(deps.db, id, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })

      // --- Operators ---
      .post(
        '/api/pipelines/:id/operators',
        zValidator('param', idParam),
        zValidator('json', createOperatorBody),
        async (c) => {
          const userId = await resolveActingUserId(deps.db)
          if (userId === null) {
            return noUser(c)
          }
          const { id } = c.req.valid('param')
          const body = c.req.valid('json')
          try {
            const configJson = validateOperatorConfig(body.type_key, body.config)
            const operatorId = await createOperator(deps.db, {
              pipelineId: id,
              name: body.name,
              typeKey: body.type_key,
              configJson,
              enabled: body.enabled,
              actorUserId: userId,
            })
            return c.json({ id: operatorId, warnings: await capabilityWarnings(deps.db, id) }, 201)
          } catch (err) {
            return handle(c, err)
          }
        },
      )
      .patch('/api/operators/:id', zValidator('param', idParam), zValidator('json', editOperatorBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        try {
          // The config is validated against the Operator's existing type_key,
          // which `editOperator` re-reads; resolve it here so the bad-config
          // 400 fires before the edit lock is taken.
          const typeKey = await operatorTypeKey(deps, id)
          const configJson = validateOperatorConfig(typeKey, body.config)
          await editOperator(deps.db, {
            operatorId: id,
            name: body.name,
            configJson,
            actorUserId: userId,
          })
          return c.json({ ok: true, warnings: await warningsForOperator(deps, id) })
        } catch (err) {
          return handle(c, err)
        }
      })
      .post('/api/operators/:id/enable', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await setOperatorEnabled(deps.db, id, true, userId)
          return c.json({ ok: true, warnings: await warningsForOperator(deps, id) })
        } catch (err) {
          return handle(c, err)
        }
      })
      .post('/api/operators/:id/disable', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await setOperatorEnabled(deps.db, id, false, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })
      .delete('/api/operators/:id', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await softDeleteOperator(deps.db, id, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })

      // --- Accounts ---
      .patch('/api/accounts/:id', zValidator('param', idParam), zValidator('json', updateAccountBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        try {
          await updateAccount(deps.db, {
            accountId: id,
            activePipelineId: body.active_pipeline_id,
            pollIntervalSeconds: body.poll_interval_seconds,
            name: body.name,
            icon: body.icon,
            color: body.color,
            actorUserId: userId,
          })
          // Activating a Pipeline on an Account warns about what that Account
          // cannot carry; it never refuses the write (d-qzxvoph1).
          const warnings =
            body.active_pipeline_id == null ? [] : await capabilityWarnings(deps.db, body.active_pipeline_id, [id])
          return c.json({ ok: true, warnings })
        } catch (err) {
          return handle(c, err)
        }
      })
      .delete('/api/accounts/:id', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await softDeleteAccount(deps.db, id, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })

      // --- Replay ---
      .post('/api/messages/:id/replay', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        // Resolve the Message's Account's active Pipeline; without one there's
        // nothing to triage under.
        const target = await deps.db
          .selectFrom('messages')
          .innerJoin('accounts', 'accounts.id', 'messages.account_id')
          .where('messages.id', '=', id)
          .select(['accounts.active_pipeline_id as active_pipeline_id'])
          .executeTakeFirst()
        if (!target) {
          return c.json(
            {
              error: {
                code: 'not_found',
                message: `Message ${id} not found`,
              },
            },
            404,
          )
        }
        if (target.active_pipeline_id === null) {
          return c.json(
            {
              error: {
                code: 'no_active_pipeline',
                message: "The Message's Account has no active Pipeline to replay under.",
              },
            },
            400,
          )
        }
        try {
          const result = await enqueueTriage(deps.db, {
            messageId: id,
            pipelineId: target.active_pipeline_id,
            triggeredBy: 'user_replay',
            actorUserId: userId,
          })
          return c.json({ triage_id: result.triageId, status: result.status }, 201)
        } catch (err) {
          return handle(c, err)
        }
      })

      // --- Limits ---
      .post('/api/limits', zValidator('json', createLimitBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const body = c.req.valid('json')
        try {
          const id = await createLimit(deps.db, {
            userId,
            resource: body.resource,
            operation: body.operation,
            scope: body.scope,
            maxCount: body.max_count,
            windowSeconds: body.window_seconds,
            actorUserId: userId,
          })
          return c.json({ id }, 201)
        } catch (err) {
          return handle(c, err)
        }
      })
      .patch('/api/limits/:id', zValidator('param', idParam), zValidator('json', editLimitBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        try {
          await editLimit(deps.db, {
            limitId: id,
            maxCount: body.max_count,
            windowSeconds: body.window_seconds,
            actorUserId: userId,
          })
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })
      .delete('/api/limits/:id', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await hardDeleteLimit(deps.db, id, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })

      // --- Cooldowns (notification kinds) ---
      .post('/api/cooldowns', zValidator('json', createCooldownBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const body = c.req.valid('json')
        try {
          const id = await createCooldown(deps.db, {
            userId,
            kind: body.kind,
            intervalSeconds: body.interval_seconds,
            actorUserId: userId,
          })
          return c.json({ id }, 201)
        } catch (err) {
          return handle(c, err)
        }
      })
      .patch('/api/cooldowns/:id', zValidator('param', idParam), zValidator('json', editCooldownBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        try {
          await editCooldown(deps.db, {
            cooldownId: id,
            intervalSeconds: body.interval_seconds,
            actorUserId: userId,
          })
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })
      .delete('/api/cooldowns/:id', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await deleteCooldown(deps.db, id, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })

      // --- Credentials (Pushover) ---
      .post('/api/credentials', zValidator('json', createCredentialBody), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        if (!deps.encryptor) {
          return c.json(
            {
              error: {
                code: 'encryptor_unconfigured',
                message: 'Credential storage is unavailable: no encryption key is configured.',
              },
            },
            400,
          )
        }
        const body = c.req.valid('json')
        try {
          const id = await storePushoverCredential(deps.db, deps.encryptor, {
            userId,
            payload: { app_token: body.app_token, user_key: body.user_key },
            actorUserId: userId,
          })
          return c.json({ id }, 201)
        } catch (err) {
          return handle(c, err)
        }
      })
      .delete('/api/credentials/:id', zValidator('param', idParam), async (c) => {
        const userId = await resolveActingUserId(deps.db)
        if (userId === null) {
          return noUser(c)
        }
        const { id } = c.req.valid('param')
        try {
          await softDeleteCredential(deps.db, id, userId)
          return c.json({ ok: true })
        } catch (err) {
          return handle(c, err)
        }
      })
  )
}

/** Look up an Operator's `type_key` (so config can be type-validated up front). */
async function operatorTypeKey(deps: ApiDeps, operatorId: number): Promise<OperatorTypeKey> {
  const row = await deps.db
    .selectFrom('operators')
    .select('type_key')
    .where('id', '=', operatorId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  if (!row) {
    // Surface as a NotFoundError so the route maps it to a 404 consistently.
    throw new NotFoundError(`Operator ${operatorId} not found or deleted`)
  }
  return operatorTypeKeySchema.parse(row.type_key)
}

/** The slice of Hono's route-local context these helpers use. */
interface JsonContext {
  json: (body: ApiErrorBody, status: 400 | 404 | 409) => Response
}

function handle(c: JsonContext, err: unknown): Response {
  const mapped = mapWriteError(err)
  if (mapped) {
    return c.json(mapped.body, mapped.status)
  }
  throw err
}

function noUser(c: JsonContext): Response {
  return c.json(
    {
      error: {
        code: 'no_user',
        message: 'No user is provisioned on this install.',
      },
    },
    400,
  )
}
