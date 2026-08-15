import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { PackKind } from '../types.js'
import { packageToken, resolvePrefix, unscopedName } from './formats.js'
import { isRecord, parseJson } from './json.js'
import { enumerateCandidates } from './workspace-enumerator.js'

/** One half of a vendored pack: the kind, and the absolute directory holding its content. */
export interface VendoredHalf {
  kind: PackKind
  dir: string
}

/** A dependency whose package holds a `vendored_pack/` tree with at least one half. */
export interface VendoredPack {
  /** the npm package name the dependency was declared under */
  name: string
  /** the name as a token: the `@` dropped and the `/` a hyphen */
  token: string
  /** the entity prefix: configured for a merged pack, the unscoped npm name otherwise */
  prefix: string
  /** the package's real directory, workspace sibling or installed */
  packageDir: string
  /** the absolute path of the `vendored_pack/` tree, for the watch set */
  vendoredDir: string
  /** the halves the tree holds, in kind order */
  halves: VendoredHalf[]
}

/** Per-dependency vendoring configuration, keyed by npm package name. */
export type VendorConfig = Record<string, { prefix?: string } | undefined>

/** What the dependency walk found: what merges, what is reachable but not admitted, and faults. */
export interface VendoredPackSet {
  /** the packs that merge: the consumer's own dependencies plus the vendor block's names */
  merged: VendoredPack[]
  /** vendored packs the transitive walk reaches that nothing admitted, kept for diagnosis */
  unmerged: VendoredPack[]
  /** configuration faults — a bad prefix, a colliding prefix, a vendor name resolving to nothing */
  problems: string[]
}

const KIND_DIRECTORIES: readonly [PackKind, string][] = [
  ['behavior', 'behavior_pack'],
  ['resource', 'resource_pack'],
]

/** Options for {@link findVendoredPacks}. */
export interface FindVendoredPacksOptions {
  /** the absolute path of the package whose dependencies are walked */
  packageDir: string
  /** the absolute path of the workspace root, whose members resolve by name */
  workspaceRoot: string
  /** the consumer's vendor block: per-dependency configuration and transitive admissions */
  vendor?: VendorConfig
}

/**
 * Walks a package's `dependencies` — never its `devDependencies` — transitively, and partitions
 * every reached package holding a `vendored_pack/` tree: a pack merges when its package sits in
 * the consumer's own `dependencies` or is named in the `vendor` block, which is also how a
 * transitive supplier is admitted without becoming a direct dependency; anything else the walk
 * reaches is returned unmerged, read-only, so a dangling reference can name its supplier. A
 * package reached along several paths is one pack, visited once.
 *
 * Each merged pack carries its entity prefix — the configured one, or its unscoped npm name — and
 * a bad prefix, two merged packs resolving to one prefix, and a vendor name that resolves to no
 * vendored pack are returned as problems.
 *
 * A dependency resolves as a workspace member by name first, then by the `node_modules` ascent
 * from the package that declared it, so an installed shared pack reads exactly as a sibling. A
 * dependency name resolving to nothing is skipped: an uninstalled dependency is as invisible to
 * the build as it is to the module loader.
 */
export async function findVendoredPacks(options: FindVendoredPacksOptions): Promise<VendoredPackSet> {
  const vendor = options.vendor ?? {}
  const problems: string[] = []
  const byName = await workspaceMembersByName(options.workspaceRoot)
  const visited = new Set<string>()
  const found: VendoredPack[] = []

  const start = await realDirectory(options.packageDir)
  if (start === undefined) {
    return { merged: [], unmerged: [], problems }
  }
  visited.add(start)

  const ownPackageJson = await readPackageJson(options.packageDir)
  const directDependencies = new Set(dependencyNames(ownPackageJson))
  const admitted = new Set([...directDependencies, ...Object.keys(vendor)])

  const queue: { name: string; fromDir: string }[] = [...directDependencies]
    .sort()
    .map((name) => ({ name, fromDir: start }))
  // a vendor name outside the dependency tree still resolves, from the consumer itself
  for (const name of Object.keys(vendor).sort()) {
    if (!directDependencies.has(name)) {
      queue.push({ name, fromDir: start })
    }
  }

  while (queue.length > 0) {
    const { name, fromDir } = queue.shift() as { name: string; fromDir: string }
    const located = byName.get(name) ?? (await ascendNodeModules(fromDir, name))
    if (located === undefined) {
      continue
    }

    const real = await realDirectory(located)
    if (real === undefined || visited.has(real)) {
      continue
    }
    visited.add(real)

    const packageJson = await readPackageJson(real)
    const halves = await vendoredHalves(real)
    if (halves.length > 0) {
      found.push({
        name,
        token: packageToken(name),
        prefix: unscopedName(name),
        packageDir: real,
        vendoredDir: path.join(real, 'vendored_pack'),
        halves,
      })
    }

    for (const dependency of dependencyNames(packageJson)) {
      queue.push({ name: dependency, fromDir: real })
    }
  }

  found.sort((a, b) => a.name.localeCompare(b.name))
  const merged = found.filter((pack) => admitted.has(pack.name))
  const unmerged = found.filter((pack) => !admitted.has(pack.name))

  const mergedNames = new Set(merged.map((pack) => pack.name))
  for (const name of Object.keys(vendor).sort()) {
    if (!mergedNames.has(name)) {
      problems.push(`the vendor block names ${name}, but it resolves to no package holding a vendored_pack/ tree`)
    }
  }

  const byPrefix = new Map<string, VendoredPack>()
  for (const pack of merged) {
    try {
      pack.prefix = resolvePrefix(pack.name, vendor[pack.name]?.prefix)
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error))
      continue
    }
    const holder = byPrefix.get(pack.prefix)
    if (holder !== undefined) {
      problems.push(
        `${holder.name} and ${pack.name} both resolve to the prefix ${JSON.stringify(pack.prefix)}: set a distinct prefix for one of them in the vendor block`,
      )
    } else {
      byPrefix.set(pack.prefix, pack)
    }
  }

  return { merged, unmerged, problems }
}

/** The workspace members by declared name; a name claimed twice keeps its first claimant. */
async function workspaceMembersByName(workspaceRoot: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>()
  for (const candidate of await enumerateCandidates(workspaceRoot)) {
    const name = candidate.packageJson.name
    if (typeof name === 'string' && !byName.has(name)) {
      byName.set(name, candidate.absoluteDir)
    }
  }
  return byName
}

/** The `dependencies` names of a parsed `package.json`, in name order. */
function dependencyNames(packageJson: unknown): string[] {
  if (!isRecord(packageJson) || !isRecord(packageJson.dependencies)) {
    return []
  }
  return Object.keys(packageJson.dependencies).sort()
}

/** Walks `node_modules/<name>` up from `fromDir` to the filesystem root, as the module loader does. */
async function ascendNodeModules(fromDir: string, name: string): Promise<string | undefined> {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'))
    if (await isDirectory(candidate)) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/** The kind-named halves a package's `vendored_pack/` tree holds, if any. */
async function vendoredHalves(packageDir: string): Promise<VendoredHalf[]> {
  const halves: VendoredHalf[] = []
  for (const [kind, directory] of KIND_DIRECTORIES) {
    const dir = path.join(packageDir, 'vendored_pack', directory)
    if (await isDirectory(dir)) {
      halves.push({ kind, dir })
    }
  }
  return halves
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory()
  } catch {
    return false
  }
}

async function realDirectory(dir: string): Promise<string | undefined> {
  try {
    return await realpath(dir)
  } catch {
    return undefined
  }
}

async function readPackageJson(dir: string): Promise<unknown> {
  try {
    return parseJson(await readFile(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
}
