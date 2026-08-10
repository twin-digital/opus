/**
 * `extractCredentialRefsFromOperatorConfig` for every declared `type_key`.
 * This hook is needed at Operator save (create/edit/enable/disable) to
 * reconcile `operator_credential_references`. The extractor registry is keyed
 * over the
 * *full* `OperatorTypeKey` union, standalone from the behavioral registry, so
 * the save-time reconciler depends only on the declarative type surface.
 *
 * That `operator_credential_references` matches `operators.config_json` is an
 * app-enforced invariant, tested by running each type's extractor against
 * representative config samples.
 */

import { type OperatorConfigFor, type OperatorTypeKey, operatorConfigSchemas } from '@grinbox/shared'

type Extractor<K extends OperatorTypeKey> = (config: OperatorConfigFor<K>) => number[]

/**
 * Per-type credential-reference extractors. Correct-for-now for every declared
 * type:
 *  - **rule_based_tagger / llm_tagger / apply_category / archive /
 *    digest_delivery**: their config carries no Credential reference → `[]`.
 *  - **notify**: references its `pushover` Credential by `credentials_id`. The
 *    field is in shared's `notifyConfigSchema`, so the extractor reads it
 *    directly.
 */
const EXTRACTORS: { [K in OperatorTypeKey]: Extractor<K> } = {
  rule_based_tagger: () => [],
  llm_tagger: () => [],
  apply_category: () => [],
  archive: () => [],
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
