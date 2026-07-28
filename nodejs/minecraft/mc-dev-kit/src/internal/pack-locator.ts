import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PackKind } from '../types.js'
import type { CandidatePackage, WorkingEntry } from './candidate.js'
import { messageOf, parseJson } from './json.js'
import { checkManifestShape } from './manifest-shape.js'
import { joinRelative } from './paths.js'

/** The two fixed source paths, and the kind each declares. */
const PACK_DIRECTORIES: readonly (readonly [PackKind, string])[] = [
  ['behavior', 'behavior_pack'],
  ['resource', 'resource_pack'],
]

/** The errors that mean the pack is not here, rather than here and unreadable. */
const ABSENT = new Set(['ENOENT', 'ENOTDIR'])

/**
 * Probes each candidate's two fixed source manifest paths — `behavior_pack/manifest.json` and
 * `resource_pack/manifest.json` — and builds an entry for each one found.
 *
 * Presence of those paths is the whole membership test: a candidate holding neither yields no
 * entry at all, and because each path is fixed a package cannot hold two packs of one kind. The
 * directory name declares the entry's kind; `sourceDir` and `outputDir` are computed from the
 * package directory and the kind, and the output tree is never read.
 *
 * A manifest that cannot be opened, read, or parsed is the single `manifest-unreadable` problem
 * and the entry carries no manifest. One that parses is checked against the shapes the format
 * documents — containers first, then the form of every field `PackManifest` declares — and each
 * fault is `manifest-shape-invalid` naming the offending field. The manifest is still reported as
 * it parsed, and later stages skip the part that faulted.
 *
 * @param workspaceRoot - the absolute path of the workspace root
 * @param candidates - the packages to probe
 * @returns one entry per pack found, in candidate order, behavior pack before resource pack
 */
export async function locatePacks(
  _workspaceRoot: string,
  candidates: readonly CandidatePackage[],
): Promise<WorkingEntry[]> {
  const entries: WorkingEntry[] = []

  for (const candidate of candidates) {
    for (const [kind, directory] of PACK_DIRECTORIES) {
      const read = await readManifest(path.join(candidate.absoluteDir, directory, 'manifest.json'))
      if (read === undefined) {
        continue
      }

      const entry: WorkingEntry = {
        kind,
        packageName: packageNameOf(candidate),
        packageDir: candidate.packageDir,
        sourceDir: joinRelative(candidate.packageDir, directory),
        outputDir: joinRelative(candidate.packageDir, 'dist', directory),
        package: candidate,
        formFaults: new Set(),
        problems: [],
      }

      if ('error' in read) {
        entry.problems.push({
          code: 'manifest-unreadable',
          message: `the source manifest at ${entry.sourceDir}/manifest.json could not be read: ${read.error}`,
          error: read.error,
        })
      } else {
        entry.manifest = read.value
        const shape = checkManifestShape(read.value)
        entry.formFaults = shape.faults
        entry.problems.push(...shape.problems)
      }

      entries.push(entry)
    }
  }

  return entries
}

/** The owning package's declared name, or its directory basename when it declares none. */
function packageNameOf(candidate: CandidatePackage): string {
  const declared = candidate.packageJson.name
  return typeof declared === 'string' ? declared : path.basename(candidate.absoluteDir)
}

type ManifestRead = { value: unknown } | { error: string }

/** Reads and parses one source manifest; `undefined` where no pack sits at that path. */
async function readManifest(manifestPath: string): Promise<ManifestRead | undefined> {
  let contents: string
  try {
    contents = await readFile(manifestPath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code !== undefined && ABSENT.has(code) ? undefined : { error: messageOf(error) }
  }

  try {
    return { value: parseJson(contents) }
  } catch (error) {
    return { error: messageOf(error) }
  }
}
