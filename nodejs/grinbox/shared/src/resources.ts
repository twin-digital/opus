import { z } from 'zod'

/**
 * The predefined, enumerable set of Resources and the operations each one
 * exposes. This const object is the single source of truth: the Zod schemas,
 * the TS types, and the per-resource operation validation are all derived from
 * it. New Resources or operations are added here and nowhere else.
 *
 * Mirrors the Resource/operation table in architecture.md ("Resources and
 * Limits"). The Daemon injects a metered client per declared Resource that
 * exposes only the declared operations; an Operator cannot invoke an operation
 * that isn't listed for its Resource.
 */
export const RESOURCE_OPERATIONS = {
  gmail_api: ['fetch_metadata', 'list_messages', 'apply_label', 'send_message'],
  pushover_api: ['send_notification'],
  llm_bedrock: ['invoke_model'],
} as const satisfies Record<string, readonly string[]>

export type ResourceOperationsMap = typeof RESOURCE_OPERATIONS

/** The set of Resource names. */
export type Resource = keyof ResourceOperationsMap

/** A Resource operation valid for the given Resource `R`. */
export type ResourceOperation<R extends Resource = Resource> = ResourceOperationsMap[R][number]

const RESOURCE_NAMES = Object.keys(RESOURCE_OPERATIONS) as [Resource, ...Resource[]]

/** Validates that a string is one of the known Resource names. */
export const resourceSchema = z.enum(RESOURCE_NAMES)

/**
 * Validates that a string is *some* known Resource operation, without checking
 * that it belongs to a particular Resource. Use {@link isResourceOperation} or
 * {@link resourceOperationDeclarationSchema} when the resource is known and the
 * operation must be valid for it.
 */
export const resourceOperationSchema = z.enum(Object.values(RESOURCE_OPERATIONS).flat() as [string, ...string[]])

/** Type guard: is `operation` a declared operation of `resource`? */
export function isResourceOperation<R extends Resource>(
  resource: R,
  operation: string,
): operation is ResourceOperation<R> {
  const ops = RESOURCE_OPERATIONS[resource] as readonly string[]
  return ops.includes(operation)
}

/**
 * A single `{ resource, operations }` declaration as it appears in an
 * Operator's Contract. Each operation is validated against the named Resource:
 * an operation the Resource doesn't expose is rejected. Operations must be a
 * non-empty, duplicate-free set.
 */
export const resourceOperationDeclarationSchema = z
  .object({
    resource: resourceSchema,
    operations: z.array(resourceOperationSchema).nonempty(),
  })
  .superRefine((decl, ctx) => {
    const seen = new Set<string>()
    for (const op of decl.operations) {
      if (seen.has(op)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate operation '${op}' for resource '${decl.resource}'`,
          path: ['operations'],
        })
      }
      seen.add(op)
      if (!isResourceOperation(decl.resource, op)) {
        ctx.addIssue({
          code: 'custom',
          message: `operation '${op}' is not declared for resource '${decl.resource}'`,
          path: ['operations'],
        })
      }
    }
  })

export type ResourceOperationDeclaration = z.infer<typeof resourceOperationDeclarationSchema>
