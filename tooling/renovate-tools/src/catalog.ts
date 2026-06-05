import { parse as parseYaml } from 'yaml'
import { lookup } from './util.js'

/** A map of catalog name → (dependency name → version range). The default catalog is keyed `default`. */
export type Catalogs = Record<string, Record<string, string>>

export type CatalogResolution =
  | { readonly type: 'resolved'; readonly specifier: string }
  | { readonly type: 'unused' }
  | { readonly type: 'misconfiguration'; readonly reason: string }

const CATALOG_PREFIX = 'catalog:'

/**
 * Parse a `pnpm-workspace.yaml` document into `{ default, ...named }` catalog maps.
 *
 * Throws on malformed YAML (callers route the throw to the errored path — a parse failure must never
 * be swallowed into an empty map, which would read as "no catalogs"). pnpm normalizes the default
 * catalog from either the top-level `catalog` field or `catalogs.default`; defining both is an error.
 */
export const parseCatalogs = (yamlText: string): Catalogs => {
  const doc: unknown = parseYaml(yamlText)
  const catalogs: Catalogs = {}
  if (!doc || typeof doc !== 'object') {
    return catalogs
  }

  const record = doc as Record<string, unknown>
  let hasDefault = false
  if (record.catalog && typeof record.catalog === 'object') {
    catalogs.default = record.catalog as Record<string, string>
    hasDefault = true
  }
  if (record.catalogs && typeof record.catalogs === 'object') {
    for (const [name, entries] of Object.entries(record.catalogs as Record<string, unknown>)) {
      if (!entries || typeof entries !== 'object') {
        continue
      }
      if (name === 'default' && hasDefault) {
        throw new Error('default catalog defined both as top-level `catalog` and `catalogs.default`')
      }
      catalogs[name] = entries as Record<string, string>
    }
  }
  return catalogs
}

/**
 * Resolve a dependency spec against the catalogs — a hand-rolled equivalent of pnpm's catalog
 * protocol. `catalog:` and `catalog:default` both reference the `default` catalog (pnpm normalizes
 * the empty name to `default`); `catalog:<name>` references a named catalog. A missing or recursive
 * entry is a misconfiguration (CI's frozen-lockfile install would also reject it).
 */
export const resolveCatalog = (catalogs: Catalogs, depName: string, spec: string): CatalogResolution => {
  if (!spec.startsWith(CATALOG_PREFIX)) {
    return { type: 'unused' }
  }

  const catalogName = spec.slice(CATALOG_PREFIX.length) || 'default'
  const catalog = lookup(catalogs, catalogName)
  if (!catalog) {
    return { type: 'misconfiguration', reason: `${depName} references unknown catalog "${catalogName}"` }
  }
  const resolved = lookup(catalog, depName)
  if (resolved === undefined) {
    return { type: 'misconfiguration', reason: `${depName} is not defined in catalog "${catalogName}"` }
  }
  if (resolved.startsWith(CATALOG_PREFIX)) {
    return { type: 'misconfiguration', reason: `catalog entry for ${depName} is itself a catalog reference` }
  }
  return { type: 'resolved', specifier: resolved }
}
