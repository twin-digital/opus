/**
 * `runOperator` — the dispatcher pipeline-runtime.md sketches (the worker calls
 * it inside `workerRun`). It resolves the snapshotted type, parses + validates
 * its config, builds the metered-client `resources` object from the type's
 * declared Contract via an injected factory, invokes the type's `run`, and
 * validates each output Tag's value against the declared output enum.
 *
 * It does NOT touch the DB: persistence (Tag rows, `triage_events`, settlement)
 * is the worker's / S2's job. `runOperator` returns the output Tags; the
 * injected clients accumulate their own events/usage via the `onEvent`/`onUsage`
 * wiring the worker closes over when it builds the factory.
 */

import type { OperatorConfigFor, OperatorTypeKey, Resource } from '@twin-digital/grinbox-shared'
import { resolveSnapshot } from './registry.js'
import type { MakeResourceClient, MessageView, OperatorRunResult, OperatorType, ResourceClients } from './types.js'

/** The snapshot a `triage_operator_runs` row carries (the worker passes it in). */
export interface OperatorSnapshot {
  readonly type_key: string
  readonly type_code_version: string
  readonly op_config_json: string
}

export interface RunOperatorArgs {
  readonly message: MessageView
  readonly tags: ReadonlyMap<string, string>
  /**
   * Builds a metered client per declared Resource. Dependency-injected so S4's
   * real clients OR a test fake plug in. The worker closes over the
   * timeout signal + event/usage accumulators here (pipeline-runtime.md
   * `buildContext`), keeping `runOperator` free of that plumbing.
   */
  readonly makeResourceClient: MakeResourceClient
  readonly signal: AbortSignal
  /**
   * Snapshot → behavioral type resolver. Defaults to the production
   * {@link resolveSnapshot} over the code-resident registry. Injectable only so
   * tests can drive `runOperator`'s config-parse / client-build / output-Tag
   * validation pipeline with a synthetic type the closed registry can't hold;
   * production always uses the default.
   */
  readonly resolve?: (snapshot: OperatorSnapshot) => OperatorType
}

/** Thrown when a snapshot's `op_config_json` is invalid for its type. */
export class InvalidOperatorConfigError extends Error {
  override readonly name = 'InvalidOperatorConfigError'
}

/** Thrown when an Operator returns a Tag value outside its declared enum. */
export class OutputTagValidationError extends Error {
  override readonly name = 'OutputTagValidationError'
}

/**
 * Runs a single Operator from its snapshot. Throwing here marks the Operator
 * run `failed` in the worker; downstream Operators cascade to `skipped`.
 */
export async function runOperator(snapshot: OperatorSnapshot, args: RunOperatorArgs): Promise<OperatorRunResult> {
  const type = (args.resolve ?? resolveSnapshot)(snapshot)

  // Parse + validate config (the enqueue-time / runtime guard).
  const config = parseConfig(type, snapshot.op_config_json)

  // Derive the Contract to know declared Resources + output enums.
  const contract = type.contractFromConfig(config)

  // Build only the declared metered clients via the injected factory. The
  // factory is generic per Resource; assigning into the partial map needs a
  // mutable, resource-erased view (the per-key types are recovered by callers
  // via the `resources` object's declared shape).
  const resources: Partial<ResourceClients> = {}
  const writable = resources as Record<Resource, ResourceClients[Resource]>
  for (const decl of contract.resources) {
    const resource = decl.resource
    writable[resource] = args.makeResourceClient(resource, decl.operations)
  }

  const result = await type.run({
    config,
    message: args.message,
    tags: args.tags,
    resources,
    signal: args.signal,
  })

  validateOutputTags(type, contract, result)
  return result
}

function parseConfig<K extends OperatorTypeKey>(type: OperatorType<K>, opConfigJson: string): OperatorConfigFor<K> {
  let raw: unknown
  try {
    raw = JSON.parse(opConfigJson)
  } catch (err) {
    throw new InvalidOperatorConfigError(
      `op_config_json for '${type.type_key}' is not valid JSON: ${(err as Error).message}`,
    )
  }
  const parsed = type.configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new InvalidOperatorConfigError(
      `op_config_json for '${type.type_key}' failed validation: ${parsed.error.message}`,
    )
  }
  return parsed.data
}

/**
 * Enforces the app-level invariant "Tag value within declared enum"
 * (data-model "Application-enforced invariants"): every returned Tag must
 * declare against the Contract's outputs and carry a value in that output's
 * enum. Rejects unknown keys and out-of-enum values.
 */
function validateOutputTags<K extends OperatorTypeKey>(
  type: OperatorType<K>,
  contract: ReturnType<OperatorType<K>['contractFromConfig']>,
  result: OperatorRunResult,
): void {
  const byKey = new Map(contract.outputs.map((o) => [o.key, new Set(o.valueEnum)]))
  for (const tag of result.tags) {
    const allowed = byKey.get(tag.key)
    if (!allowed) {
      throw new OutputTagValidationError(
        `Operator '${type.type_key}' emitted Tag '${tag.key}' which is not a declared output`,
      )
    }
    if (!allowed.has(tag.value)) {
      throw new OutputTagValidationError(
        `Operator '${type.type_key}' emitted Tag '${tag.key}'='${tag.value}' which is not in the declared value enum`,
      )
    }
  }
}
