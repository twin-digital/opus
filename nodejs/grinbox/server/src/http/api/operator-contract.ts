/**
 * Read-side Contract derivation for the `/api` routes. Mirrors the per-key
 * narrowing in `pipeline/validation.ts`'s `deriveContract`, but tolerant of
 * malformed rows: the read API renders whatever is in the DB (including an
 * Operator whose `config_json` no longer parses, or an unknown `type_key`),
 * so it returns `null` rather than throwing on a row the validator would
 * reject. The write path is the place that enforces validity; the read path
 * only reports.
 */

import {
  type Contract,
  type OperatorTypeKey,
  operatorConfigSchemas,
  operatorTypeRegistry,
} from '@twin-digital/grinbox-shared'

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

  switch (typeKey) {
    case 'llm_tagger':
      return operatorTypeRegistry.llm_tagger.contractFromConfig(
        parsed.data as Parameters<typeof operatorTypeRegistry.llm_tagger.contractFromConfig>[0],
      )
    case 'rule_based_tagger':
      return operatorTypeRegistry.rule_based_tagger.contractFromConfig(
        parsed.data as Parameters<typeof operatorTypeRegistry.rule_based_tagger.contractFromConfig>[0],
      )
    case 'notify':
      return operatorTypeRegistry.notify.contractFromConfig(
        parsed.data as Parameters<typeof operatorTypeRegistry.notify.contractFromConfig>[0],
      )
    case 'apply_category':
      return operatorTypeRegistry.apply_category.contractFromConfig(
        parsed.data as Parameters<typeof operatorTypeRegistry.apply_category.contractFromConfig>[0],
      )
    case 'digest_delivery':
      return operatorTypeRegistry.digest_delivery.contractFromConfig(
        parsed.data as Parameters<typeof operatorTypeRegistry.digest_delivery.contractFromConfig>[0],
      )
  }
}
