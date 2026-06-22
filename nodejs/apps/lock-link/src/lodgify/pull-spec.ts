/**
 * Regenerates the vendored `lodgify.openapi.json` from Lodgify's live docs.
 *
 * Run manually when refreshing the documented contract, and nightly in CI (which opens a
 * PR if the output changed — the contract test then runs against the new spec). Never
 * imported by the handler or the test suite; those read the committed JSON.
 *
 *   pnpm --filter @twin-digital/lock-link exec tsx src/lodgify/pull-spec.ts
 */
import { writeFileSync } from 'node:fs'

import { format, resolveConfig } from 'prettier'

import { fetchLodgifySpec } from './openapi-source.js'

const OUT = new URL('./lodgify.openapi.json', import.meta.url)

/**
 * Recursively sort object keys (array order is preserved — it can be meaningful in
 * OpenAPI). Prettier doesn't sort, so without this the vendored file mirrors Lodgify's
 * serialization order; canonicalizing here means a drift PR reflects only real changes,
 * never upstream key reordering.
 */
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

const spec = await fetchLodgifySpec()
// Emit canonical Prettier-formatted JSON (keys sorted) so regeneration is byte-for-byte
// idempotent — otherwise the nightly drift check would flag formatting/ordering noise.
const prettierConfig = await resolveConfig(OUT.pathname)
const json = await format(JSON.stringify(sortKeys(spec)), {
  ...prettierConfig,
  parser: 'json',
  filepath: OUT.pathname,
})
writeFileSync(OUT, json)
process.stdout.write(
  `Wrote ${OUT.pathname} (${String(Object.keys(spec.paths).length)} paths, ${String(
    Object.keys(spec.components.schemas).length,
  )} component schemas)\n`,
)
