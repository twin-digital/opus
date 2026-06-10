import { z } from 'zod'
import { type LimitScope, limitScopeSchema } from './enums.js'
import { type Resource, type ResourceOperation, resourceSchema } from './resources.js'

/**
 * A Limit definition: a per-User cap on a Resource operation, scoped to a
 * rolling window (`per_window`) or to a single Message (`per_message`).
 *
 * Mirrors the `limits` table's CHECK invariant: `per_window` requires a
 * positive `window_seconds`; `per_message` requires it to be null.
 */
export const limitDefinitionSchema = z
  .object({
    resource: resourceSchema,
    operation: z.string().min(1),
    scope: limitScopeSchema,
    max_count: z.number().int().positive(),
    window_seconds: z.number().int().positive().nullable(),
  })
  .superRefine((limit, ctx) => {
    if (limit.scope === 'per_window' && limit.window_seconds == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'per_window limits require a positive window_seconds',
        path: ['window_seconds'],
      })
    }
    if (limit.scope === 'per_message' && limit.window_seconds != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'per_message limits must have null window_seconds',
        path: ['window_seconds'],
      })
    }
  })
export type LimitDefinition = z.infer<typeof limitDefinitionSchema>

/**
 * The default Limits seeded per User on install. Transcribed from the
 * data-model.md "Defaults seeded per User on install" table. The server's
 * install seeder consumes this list as its single source of truth.
 *
 * Typed against the concrete Resource/operation registry so a typo in a
 * resource name or an operation that doesn't belong to its resource is a
 * compile-time error.
 */
export const DEFAULT_LIMITS: readonly {
  resource: Resource
  operation: ResourceOperation
  scope: LimitScope
  max_count: number
  window_seconds: number | null
}[] = [
  {
    resource: 'pushover_api',
    operation: 'send_notification',
    scope: 'per_window',
    max_count: 10,
    window_seconds: 600,
  },
  {
    resource: 'pushover_api',
    operation: 'send_notification',
    scope: 'per_message',
    max_count: 1,
    window_seconds: null,
  },
  {
    resource: 'gmail_api',
    operation: 'apply_label',
    scope: 'per_window',
    max_count: 100,
    window_seconds: 600,
  },
  {
    resource: 'gmail_api',
    operation: 'send_message',
    scope: 'per_window',
    max_count: 5,
    window_seconds: 86400,
  },
  {
    resource: 'gmail_api',
    operation: 'send_message',
    scope: 'per_message',
    max_count: 1,
    window_seconds: null,
  },
  {
    resource: 'llm_bedrock',
    operation: 'invoke_model',
    scope: 'per_window',
    max_count: 50,
    window_seconds: 600,
  },
]
