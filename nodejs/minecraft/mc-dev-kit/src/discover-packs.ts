import path from 'node:path'
import type { WorkingEntry } from './internal/candidate.js'
import { matchesCriteria } from './internal/filter.js'
import { isRecord } from './internal/json.js'
import { completeManifests, sourceUuid } from './internal/manifest-completion.js'
import { locatePacks } from './internal/pack-locator.js'
import { validatePacks } from './internal/pack-validation.js'
import { compareEntryPaths } from './internal/paths.js'
import { enumerateCandidates } from './internal/workspace-enumerator.js'
import type { DiscoverOptions, PackEntry, PackManifest, Problem } from './types.js'

/**
 * Discovers the Minecraft Bedrock packs in a workspace and reports each one validated and
 * completed.
 *
 * The returned array is the single flat list of everything found, ordered by package directory
 * with a package's behavior pack before its resource pack, and every entry is `valid` or
 * `invalid`. Whatever the kit finds appears in the list: a fault after enumeration becomes a
 * problem on an entry rather than a thrown error.
 *
 * The filesystem is read once per call and the whole set is built eagerly; a `filter` narrows that
 * in-memory set once it is built. Nothing is cached between calls and nothing is watched, so a
 * consumer wanting fresh data, or a second filtering, calls again.
 *
 * @param options - `workspace` is the workspace root, defaulting to `process.cwd()`, and a
 *   relative path resolves against that same directory; `filter` narrows the entries returned.
 * @returns every pack found, or those matching `filter` when one is given, empty when none match
 * @throws when the workspace cannot be enumerated at all — the root holds neither a readable
 *   `pnpm-workspace.yaml` nor a readable `package.json`, the root `package.json` an npm workspace
 *   is read from is not valid JSON, or the enumeration library throws, which it does when any
 *   workspace member's `package.json` is not valid JSON. The underlying error reaches the caller
 *   unwrapped.
 *
 * @example
 * ```ts
 * const packs = await discoverPacks()
 * const broken = await discoverPacks({ filter: { status: 'invalid' } })
 * ```
 */
export async function discoverPacks(options: DiscoverOptions = {}): Promise<readonly PackEntry[]> {
  const workspaceRoot = path.resolve(process.cwd(), options.workspace ?? '.')

  const candidates = await enumerateCandidates(workspaceRoot)
  const located = await locatePacks(workspaceRoot, candidates)
  located.sort(compareEntryPaths)

  completeManifests(located)
  validatePacks(located)

  const packs = located.map(toPackEntry)
  const filter = options.filter
  return filter === undefined ? packs : packs.filter((pack) => matchesCriteria(pack, filter))
}

/** Exposes a working entry as the consumer meets it, valid or invalid. */
function toPackEntry(entry: WorkingEntry): PackEntry {
  const base = {
    kind: entry.kind,
    packageName: entry.packageName,
    packageDir: entry.packageDir,
    sourceDir: entry.sourceDir,
    outputDir: entry.outputDir,
  }
  const uuid = sourceUuid(entry)
  const version = completedVersion(entry)

  if (entry.problems.length === 0) {
    return {
      status: 'valid',
      ...base,
      uuid: uuid as string,
      version: version as string,
      manifest: entry.manifest as PackManifest,
      problems: [],
    }
  }

  return {
    status: 'invalid',
    ...base,
    ...(uuid !== undefined && { uuid }),
    ...(version !== undefined && { version }),
    ...(entry.manifest !== undefined && { manifest: entry.manifest }),
    problems: entry.problems as [Problem, ...Problem[]],
  }
}

/** The completed `header.version`, which is the entry's version. */
function completedVersion(entry: WorkingEntry): string | undefined {
  const manifest = entry.manifest
  if (!isRecord(manifest) || !isRecord(manifest.header)) {
    return undefined
  }
  return typeof manifest.header.version === 'string' ? manifest.header.version : undefined
}
