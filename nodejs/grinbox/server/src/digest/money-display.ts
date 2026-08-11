/**
 * Which Tag keys render in money display form (d-m6ingqyv): the keys the
 * pipeline's enabled operators type as extracted money outputs. The rendering
 * itself is `@grinbox/shared`'s `formatMoneyDisplay` — one set of conventions
 * for the digest and the interface (d-oc073wsp, d-b1ntd8go, d-u4gpx6ke) —
 * applied at composition time, never stored (d-nj43sz9w).
 */

/**
 * The Tag keys the pipeline's enabled operators type as extracted money
 * (d-m6ingqyv): what renders in display form. Derived from stored
 * `config_json` rows; a config that doesn't parse contributes nothing.
 */
export function moneyTypedTagKeys(operators: readonly { type_key: string; config_json: string }[]): Set<string> {
  const keys = new Set<string>()
  for (const row of operators) {
    if (row.type_key !== 'llm_tagger') {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(row.config_json)
    } catch {
      continue
    }
    const outputs = (parsed as { outputs?: unknown }).outputs
    if (!Array.isArray(outputs)) {
      continue
    }
    for (const output of outputs) {
      const o = output as { tag_key?: unknown; value_type?: unknown }
      if (typeof o.tag_key === 'string' && o.value_type === 'money') {
        keys.add(o.tag_key)
      }
    }
  }
  return keys
}
