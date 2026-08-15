import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { PackKind } from '../types.js'
import { isRecord, parseJson } from './json.js'
import { packageToken } from './formats.js'
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
  /** the package's real directory, workspace sibling or installed */
  packageDir: string
  /** the absolute path of the `vendored_pack/` tree, for the watch set */
  vendoredDir: string
  /** the halves the tree holds, in kind order */
  halves: VendoredHalf[]
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
}

/**
 * Walks a package's `dependencies` — never its `devDependencies` — transitively, and returns
 * every reached package holding a `vendored_pack/` tree with at least one kind-named half.
 *
 * A dependency resolves as a workspace member by name first, then by the `node_modules` ascent
 * from the package that declared it, so an installed shared pack reads exactly as a sibling. A
 * name resolving to nothing is skipped: an uninstalled dependency is as invisible to the build as
 * it is to the module loader. Directories are compared real — pnpm reaches installed packages
 * through symlinks — and each package is visited once.
 *
 * @param options - the package to walk from, and the workspace whose members resolve by name
 * @returns the vendored packs found, sorted by package name
 */
export async function findVendoredPacks(options: FindVendoredPacksOptions): Promise<VendoredPack[]> {
  const byName = await workspaceMembersByName(options.workspaceRoot)
  const visited = new Set<string>()
  const found: VendoredPack[] = []

  const start = await realDirectory(options.packageDir)
  if (start === undefined) {
    return []
  }
  visited.add(start)

  const queue: { name: string; fromDir: string }[] = enqueueDependencies(
    await readPackageJson(options.packageDir),
    start,
  )

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
        packageDir: real,
        vendoredDir: path.join(real, 'vendored_pack'),
        halves,
      })
    }

    queue.push(...enqueueDependencies(packageJson, real))
  }

  return found.sort((a, b) => a.name.localeCompare(b.name))
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

/** The `dependencies` of a parsed `package.json`, as queue entries, in name order. */
function enqueueDependencies(packageJson: unknown, fromDir: string): { name: string; fromDir: string }[] {
  if (!isRecord(packageJson) || !isRecord(packageJson.dependencies)) {
    return []
  }
  return Object.keys(packageJson.dependencies)
    .sort()
    .map((name) => ({ name, fromDir }))
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
