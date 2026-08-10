/**
 * Resolves a `triage_operator_runs` snapshot's declared input/output Tag keys
 * from the code-resident registry, for the execution loop's input
 * classification. The Contract is a property of the *code* (the
 * `(type_key, type_code_version)` registration), derived from the snapshotted
 * `op_config_json` via the type's `contractFromConfig`.
 *
 * Resolution can throw (unknown type / stale code version via
 * {@link resolveSnapshot}, or invalid config via the type's `configSchema`).
 * The caller — the loop — treats a throw as a run that can't run and fails it,
 * letting downstream Operators cascade-skip naturally.
 */

import { resolveSnapshot } from '../operators/registry.js'
import type { OperatorSnapshot } from '../operators/run.js'

/** A snapshot's resolved declared input/output Tag keys. */
export interface SnapshotContract {
  readonly inputKeys: readonly string[]
  readonly outputKeys: readonly string[]
}

/**
 * Resolve the declared input + output Tag keys for a run snapshot. Throws
 * {@link import('../operators/registry.js').UnknownOperatorTypeError} for an
 * unknown/stale type, or the config schema's error if `op_config_json` doesn't
 * parse/validate.
 */
export function resolveSnapshotContract(snapshot: OperatorSnapshot): SnapshotContract {
  const type = resolveSnapshot(snapshot)
  const raw: unknown = JSON.parse(snapshot.op_config_json)
  // The type's schema is keyed to its own config type; parse defensively and
  // let a validation failure surface to the loop (which fails the run).
  const config = type.configSchema.parse(raw)
  const contract = type.contractFromConfig(config)
  return {
    inputKeys: contract.inputs,
    outputKeys: contract.outputs.map((o) => o.key),
  }
}
