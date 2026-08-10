/**
 * Read-side Contract derivation for the `/api` routes. Same derivation as
 * `pipeline/validation.ts`, but tolerant of malformed rows: the read API
 * renders whatever is in the DB (including an Operator whose `config_json` no
 * longer parses, or an unknown `type_key`), so it returns `null` rather than
 * throwing on a row the validator would reject. The write path is the place
 * that enforces validity; the read path only reports.
 */

import {
  type Contract,
  type OperatorConfigFor,
  type OperatorTypeKey,
  contractFromConfig,
  operatorConfigSchemas,
  operatorTypeRegistry,
} from '@grinbox/shared'

function isKnownType(typeKey: string): typeKey is OperatorTypeKey {
  return Object.hasOwn(operatorTypeRegistry, typeKey)
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Derive an Operator's Contract from its stored `type_key` + `config_json`.
 * Returns `null` when the type is unknown to the running code or the config no
 * longer parses against its schema — the read surface surfaces that as "no
 * derivable contract" instead of failing the whole request.
 */
export function deriveContractForRow(typeKey: string, configJson: string): Contract | null {
  if (!isKnownType(typeKey)) {
    return null
  }
  const parsed = operatorConfigSchemas[typeKey].safeParse(safeJsonParse(configJson))
  if (!parsed.success) {
    return null
  }

  // `parsed.data` is the validated config for `typeKey`; the cast reasserts the
  // per-key pairing TypeScript can't track through the unlinked generic.
  return contractFromConfig(typeKey, parsed.data as OperatorConfigFor<OperatorTypeKey>)
}
