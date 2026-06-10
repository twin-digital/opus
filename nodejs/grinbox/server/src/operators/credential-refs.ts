/**
 * `extractCredentialRefsFromOperatorConfig` for every declared `type_key`,
 * including types whose `run` isn't implemented yet. This hook is needed at
 * Operator save (create/edit/enable/disable) to reconcile
 * `operator_credential_references` (data-model "operator_credential_references")
 * — and that save path exists for a type before its runtime does. So the
 * extractor registry is keyed over the *full* `OperatorTypeKey` union, separate
 * from the behavioral registry (which only holds runnable types).
 *
 * The data-model lists "`operator_credential_references` matches
 * `operators.config_json`" as an app-enforced invariant whose test is "each
 * type's extractor against representative config samples" — these are those
 * extractors.
 */

import { type OperatorConfigFor, type OperatorTypeKey, operatorConfigSchemas } from '@twin-digital/grinbox-shared'

type Extractor<K extends OperatorTypeKey> = (config: OperatorConfigFor<K>) => number[]

/**
 * Per-type credential-reference extractors. Correct-for-now for every declared
 * type:
 *  - **rule_based_tagger / llm_tagger / apply_category / digest_delivery**:
 *    their config carries no Credential reference → `[]`.
 *  - **notify**: references its `pushover` Credential by `credentials_id`. The
 *    field is in shared's `notifyConfigSchema`, so the extractor reads it
 *    directly.
 */
const EXTRACTORS: { [K in OperatorTypeKey]: Extractor<K> } = {
  rule_based_tagger: () => [],
  llm_tagger: () => [],
  apply_category: () => [],
  digest_delivery: () => [],
  notify: (config) => [config.credentials_id],
}

/**
 * Extracts the `credential_id` set a parsed Operator config references. Pure;
 * the save-time reconciler validates the config through
 * `operatorConfigSchemas[typeKey]` before calling this.
 */
export function extractCredentialRefsFromOperatorConfig<K extends OperatorTypeKey>(
  typeKey: K,
  config: OperatorConfigFor<K>,
): number[] {
  return EXTRACTORS[typeKey](config)
}

/**
 * Parses raw `config_json` for `typeKey` and extracts its credential refs in
 * one step — the shape the save-time reconciler uses. Throws if the JSON is
 * invalid for the type.
 */
export function extractCredentialRefsFromConfigJson(typeKey: OperatorTypeKey, configJson: string): number[] {
  const config = operatorConfigSchemas[typeKey].parse(JSON.parse(configJson))
  return extractCredentialRefsFromOperatorConfig(typeKey, config as OperatorConfigFor<typeof typeKey>)
}
