import { resolveCatalog, type Catalogs } from './catalog.js'
import { lookup } from './util.js'

export type DepMap = Record<string, string>

export interface Manifest {
  readonly name?: string
  readonly dependencies?: DepMap
  readonly optionalDependencies?: DepMap
  readonly peerDependencies?: DepMap
}

export const RUNTIME_TYPES = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const
export type RuntimeType = (typeof RUNTIME_TYPES)[number]

/** One effective (catalog-resolved) range, tagged with the dependency type it was declared under. */
export interface EffectiveDep {
  readonly type: RuntimeType
  readonly range: string
}

/** key `${type}:${depName}` → effective range. */
export type EffectiveRanges = Record<string, EffectiveDep>

// Only `patch` and `major` are ever emitted (flat-patch policy; peer cross-major escalates).
export const PATCH = 0
export const MAJOR = 1
export const RANK_NAME = ['patch', 'major'] as const

/**
 * Build the effective published ranges for one manifest, resolving `catalog:` values against the
 * catalogs. Returns the ranges plus any misconfiguration reasons (callers route those to the errored
 * path — a `catalog:` we can't resolve must not be silently dropped).
 */
export const effectiveRanges = (
  manifest: Manifest,
  catalogs: Catalogs,
): { ranges: EffectiveRanges; misconfigurations: string[] } => {
  const ranges: EffectiveRanges = {}
  const misconfigurations: string[] = []

  for (const type of RUNTIME_TYPES) {
    const deps = manifest[type]
    if (!deps) {
      continue
    }
    for (const [depName, rawSpec] of Object.entries(deps)) {
      const resolution = resolveCatalog(catalogs, depName, rawSpec)
      if (resolution.type === 'misconfiguration') {
        misconfigurations.push(resolution.reason)
        continue
      }
      const range = resolution.type === 'resolved' ? resolution.specifier : rawSpec
      ranges[`${type}:${depName}`] = { type, range }
    }
  }
  return { ranges, misconfigurations }
}

/** Leading major integer of a range (`^19.2` → 19, `>=18 <20` → 18), or null if unparseable. */
export const majorOf = (spec: string | undefined): number | null => {
  if (!spec) {
    return null
  }
  const m = /(\d+)/.exec(spec)
  return m ? Number.parseInt(m[1], 10) : null
}

/** True only when both ranges parse and their majors differ (widening keeps the old major → false). */
export const crossesMajor = (a: string | undefined, b: string | undefined): boolean => {
  const x = majorOf(a)
  const y = majorOf(b)
  return x !== null && y !== null && x !== y
}

/**
 * Diff a package's base vs head effective ranges → the bump rank, or null if nothing changed.
 *
 * A dep present on one side only (added/removed) counts as changed at `patch` (magnitude unknowable),
 * and the `undefined` comparison must not throw. A `peerDependencies` range crossing a major
 * escalates to `major`; everything else is `patch`. The package's bump is the max over its deps.
 */
export const bumpForPackage = (base: EffectiveRanges, head: EffectiveRanges): number | null => {
  let bump = -1
  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const b = lookup(base, key)
    const h = lookup(head, key)
    if (b?.range === h?.range) {
      continue // unchanged
    }
    const present = h ?? b
    if (!present) {
      continue // unreachable (key came from the union), but keeps the access type-safe
    }
    const escalates =
      present.type === 'peerDependencies' && b !== undefined && h !== undefined && crossesMajor(b.range, h.range)
    const rank = escalates ? MAJOR : PATCH
    if (rank > bump) {
      bump = rank
    }
  }
  return bump >= 0 ? bump : null
}
