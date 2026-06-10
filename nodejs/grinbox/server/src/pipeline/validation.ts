/**
 * Save-time Pipeline validation (S3). Pure function over the post-change set of
 * a Pipeline's *enabled* Operators — no DB access — so it is trivially testable
 * and reusable by both the Operator-save write pattern and the lightweight
 * Triage-creation recheck (pipeline-runtime.md "Contract validation lifecycle").
 *
 * ## Why shared's declarative registry, not the server's behavioral one
 *
 * Validation must cover **all five declared Operator types** — a Pipeline may
 * hold rows of any declared type, including ones whose runtime (`run`) hasn't
 * landed yet. The Contract derivation therefore goes through
 * `@twin-digital/grinbox-shared`'s declarative `operatorTypeRegistry` /
 * `operatorConfigSchemas` / `contractFromConfig`, which know all five types.
 *
 * It deliberately does NOT route through the server's behavioral registry
 * (`operators/registry.ts`), which only contains the *runnable* types (the two
 * Taggers today) on purpose: feeding the full type union into `getOperatorType`
 * /`resolveSnapshot` would be both a type error and a logic error (a
 * declared-but-not-yet-runnable type is a legal thing to save). The behavioral
 * registry's `resolveSnapshot` is reserved for the runtime/enqueue runnability
 * recheck (see `triage-enqueue.ts`).
 */

import {
  type Contract,
  type OperatorTypeKey,
  operatorConfigSchemas,
  operatorTypeRegistry,
  resourceOperationDeclarationSchema,
} from '@twin-digital/grinbox-shared'

/** One Operator as the validator sees it: identity + type + raw config JSON. */
export interface OperatorForValidation {
  readonly operator_id: number
  readonly type_key: string
  readonly config_json: string
}

/** A single validation failure, tagged by kind for structured handling/tests. */
export type ValidationError =
  | {
      readonly kind: 'unknown_type'
      readonly operatorId: number
      readonly typeKey: string
      readonly message: string
    }
  | {
      readonly kind: 'invalid_config'
      readonly operatorId: number
      readonly typeKey: string
      readonly message: string
    }
  | {
      readonly kind: 'invalid_resource_declaration'
      readonly operatorId: number
      readonly message: string
    }
  | {
      readonly kind: 'output_key_collision'
      readonly key: string
      readonly operatorIds: readonly number[]
      readonly message: string
    }
  | {
      readonly kind: 'dangling_input'
      readonly operatorId: number
      readonly inputKey: string
      readonly message: string
    }
  | {
      readonly kind: 'cycle'
      readonly cycle: readonly number[]
      readonly message: string
    }

export type ValidationResult =
  | { readonly ok: true; readonly contracts: ReadonlyMap<number, Contract> }
  | { readonly ok: false; readonly errors: readonly ValidationError[] }

function isKnownType(typeKey: string): typeKey is OperatorTypeKey {
  return Object.hasOwn(operatorTypeRegistry, typeKey)
}

/**
 * Validates the post-change set of enabled Operators for a Pipeline. The set is
 * the *result* of applying the proposed create/edit/enable/disable/delete —
 * callers compute the post-state and hand it here.
 *
 * Checks, in order (per-Operator structural checks first, then graph-level):
 *  1. `type_key` is a known declared type.
 *  2. `config_json` parses against the type's `operatorConfigSchemas` entry.
 *  3. Each Contract's Resource/operation declarations are valid.
 *  4. Output Tag-key single-producer: no two enabled Operators declare the same
 *     output key.
 *  5. Dangling input: every declared input key is produced by some enabled
 *     Operator in the set.
 *  6. Acyclicity: the input→output dependency DAG has no cycle (the cycle is
 *     reported when one is found).
 *
 * All per-Operator and collision/dangling errors are collected; the result is
 * `ok` only when there are none. Returns the derived Contracts on success so
 * callers don't re-derive them.
 */
export function validatePipeline(operators: readonly OperatorForValidation[]): ValidationResult {
  const errors: ValidationError[] = []
  const contracts = new Map<number, Contract>()

  // 1–3: per-Operator type + config + resource-declaration checks.
  for (const op of operators) {
    if (!isKnownType(op.type_key)) {
      errors.push({
        kind: 'unknown_type',
        operatorId: op.operator_id,
        typeKey: op.type_key,
        message: `Operator ${op.operator_id} has unknown type_key '${op.type_key}'`,
      })
      continue
    }
    const typeKey = op.type_key
    const parsed = operatorConfigSchemas[typeKey].safeParse(safeJsonParse(op.config_json))
    if (!parsed.success) {
      errors.push({
        kind: 'invalid_config',
        operatorId: op.operator_id,
        typeKey,
        message: `Operator ${op.operator_id} config invalid for '${typeKey}': ${parsed.error.message}`,
      })
      continue
    }

    // `parsed.data` is the validated config for `typeKey`; the registry entry's
    // `contractFromConfig` is typed per-key, so derive through the per-key entry.
    const contract = deriveContract(typeKey, parsed.data)

    // 3: re-validate the derived Resource declarations against shared's schema.
    // The static declarations are correct by construction, but a future
    // config-driven Resource set would surface a bad declaration here.
    let resourceOk = true
    for (const decl of contract.resources) {
      const declCheck = resourceOperationDeclarationSchema.safeParse(decl)
      if (!declCheck.success) {
        resourceOk = false
        errors.push({
          kind: 'invalid_resource_declaration',
          operatorId: op.operator_id,
          message: `Operator ${op.operator_id} declares an invalid Resource operation: ${declCheck.error.message}`,
        })
      }
    }
    if (resourceOk) {
      contracts.set(op.operator_id, contract)
    }
  }

  // If any Operator failed to produce a Contract, the graph is incomplete;
  // report the structural errors without attempting graph-level checks (they'd
  // produce confusing secondary errors against a partial graph).
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // 4–6: graph-level checks over the derived Contracts.
  const graphErrors = validateContractGraph(contracts)
  if (graphErrors.length > 0) {
    return { ok: false, errors: graphErrors }
  }
  return { ok: true, contracts }
}

/**
 * The graph-level half of validation, over already-derived Contracts keyed by
 * `operator_id`. Separated from {@link validatePipeline} so the single-producer,
 * dangling-input, and cycle checks are directly testable with synthetic
 * Contracts independent of how any specific built-in derives its inputs.
 *
 *  4. Output Tag-key single-producer: no two Operators declare the same output.
 *  5. Dangling input: every declared input key is produced by some Operator.
 *  6. Acyclicity: the producer→consumer dependency DAG has no cycle (reported).
 *
 * The cycle check runs only when outputs are uniquely produced and inputs are
 * satisfiable; running it over a graph with a collision/dangling edge would
 * report a confusing secondary error.
 */
export function validateContractGraph(contracts: ReadonlyMap<number, Contract>): ValidationError[] {
  const errors: ValidationError[] = []

  const producers = new Map<string, number[]>()
  for (const [operatorId, contract] of contracts) {
    for (const out of contract.outputs) {
      const list = producers.get(out.key)
      if (list) {
        list.push(operatorId)
      } else {
        producers.set(out.key, [operatorId])
      }
    }
  }
  for (const [key, operatorIds] of producers) {
    if (operatorIds.length > 1) {
      errors.push({
        kind: 'output_key_collision',
        key,
        operatorIds,
        message: `Tag key '${key}' is produced by more than one enabled Operator (${operatorIds.join(', ')})`,
      })
    }
  }

  for (const [operatorId, contract] of contracts) {
    for (const inputKey of contract.inputs) {
      if (!producers.has(inputKey)) {
        errors.push({
          kind: 'dangling_input',
          operatorId,
          inputKey,
          message: `Operator ${operatorId} requires input Tag '${inputKey}' which no enabled Operator produces`,
        })
      }
    }
  }

  if (errors.length === 0) {
    const cycle = findCycle(contracts, producers)
    if (cycle) {
      errors.push({
        kind: 'cycle',
        cycle,
        message: `Operator dependency cycle: ${cycle.join(' -> ')}`,
      })
    }
  }

  return errors
}

/**
 * Type-safe Contract derivation: narrows on `typeKey` so the per-key
 * `contractFromConfig` receives its matching config type. `config` is the
 * already-validated output of `operatorConfigSchemas[typeKey].safeParse`.
 */
function deriveContract(typeKey: OperatorTypeKey, config: unknown): Contract {
  switch (typeKey) {
    case 'llm_tagger':
      return operatorTypeRegistry.llm_tagger.contractFromConfig(
        config as Parameters<typeof operatorTypeRegistry.llm_tagger.contractFromConfig>[0],
      )
    case 'rule_based_tagger':
      return operatorTypeRegistry.rule_based_tagger.contractFromConfig(
        config as Parameters<typeof operatorTypeRegistry.rule_based_tagger.contractFromConfig>[0],
      )
    case 'notify':
      return operatorTypeRegistry.notify.contractFromConfig(
        config as Parameters<typeof operatorTypeRegistry.notify.contractFromConfig>[0],
      )
    case 'apply_category':
      return operatorTypeRegistry.apply_category.contractFromConfig(
        config as Parameters<typeof operatorTypeRegistry.apply_category.contractFromConfig>[0],
      )
    case 'digest_delivery':
      return operatorTypeRegistry.digest_delivery.contractFromConfig(
        config as Parameters<typeof operatorTypeRegistry.digest_delivery.contractFromConfig>[0],
      )
  }
}

function safeJsonParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    // Returning a non-object sentinel lets the Zod schema fail with a normal
    // "invalid config" error rather than throwing out of validation.
    return undefined
  }
}

/**
 * DFS cycle detection over operator dependency edges. Edge: producer(input) →
 * consumer. Returns the cycle as a list of operator_ids (closing back to the
 * first), or `null` when the graph is acyclic. Assumes single-producer (checked
 * earlier), so each input key maps to at most one producer.
 */
function findCycle(
  contracts: ReadonlyMap<number, Contract>,
  producers: ReadonlyMap<string, number[]>,
): number[] | null {
  const adjacency = new Map<number, number[]>()
  for (const [operatorId, contract] of contracts) {
    const deps: number[] = []
    for (const inputKey of contract.inputs) {
      const ownerList = producers.get(inputKey)
      const owner = ownerList?.[0]
      if (owner !== undefined && owner !== operatorId) {
        deps.push(owner)
      }
    }
    adjacency.set(operatorId, deps)
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<number, number>()
  for (const id of adjacency.keys()) {
    color.set(id, WHITE)
  }
  const stack: number[] = []

  const visit = (node: number): number[] | null => {
    color.set(node, GRAY)
    stack.push(node)
    for (const next of adjacency.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        // Found a back-edge: extract the cycle from the stack.
        const start = stack.indexOf(next)
        return [...stack.slice(start), next]
      }
      if (color.get(next) === WHITE) {
        const found = visit(next)
        if (found) {
          return found
        }
      }
    }
    stack.pop()
    color.set(node, BLACK)
    return null
  }

  for (const id of adjacency.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id)
      if (found) {
        return found
      }
    }
  }
  return null
}
