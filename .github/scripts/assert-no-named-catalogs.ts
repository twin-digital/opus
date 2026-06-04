/**
 * CI guard (spec §8): fail the build if pnpm-workspace.yaml introduces NAMED
 * catalogs (a top-level `catalogs:` key).
 *
 * The Renovate changeset automation (.github/scripts/renovate-changeset.ts) only
 * understands the DEFAULT `catalog:` block. A bump inside a named catalog would
 * not be detected, so consuming packages would ship without a changeset — a
 * silent release miss. Rather than under-detect, we reject named catalogs here
 * until the generator is extended (see docs/cicd/renovate-integration.md §8).
 *
 * Runs under Node 24 native type-stripping. Self-contained, no dependencies.
 */
import { readFileSync } from 'node:fs'

const WORKSPACE = 'pnpm-workspace.yaml'
const DOC = 'docs/cicd/renovate-integration.md (§8)'

function hasNamedCatalogs(yamlText: string): boolean {
  // A top-level `catalogs:` mapping. The default block is `catalog:` (singular).
  return yamlText.split('\n').some((line) => /^catalogs:\s*$/.test(line))
}

let text: string
try {
  text = readFileSync(WORKSPACE, 'utf8')
} catch {
  // No workspace file (or unreadable) — nothing to guard.
  process.exit(0)
}

if (hasNamedCatalogs(text)) {
  console.error(
    [
      `ERROR: named pnpm catalogs ("catalogs:") found in ${WORKSPACE}.`,
      '',
      'Named catalogs are NOT supported by the Renovate changeset automation and would',
      'cause dependency updates to ship without a changeset (a silent release miss).',
      '',
      `See ${DOC} for why, and for what extending the generator would require.`,
      'Until that work is done, use only the default `catalog:` block.',
    ].join('\n'),
  )
  process.exit(1)
}

console.log(`OK: ${WORKSPACE} uses only the default catalog.`)
