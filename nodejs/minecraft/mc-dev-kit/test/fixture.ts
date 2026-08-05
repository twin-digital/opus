import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'tsdown'
import { onTestFinished } from 'vitest'
import { packBuild } from '../src/build.js'
import type { CandidatePackage, WorkingEntry } from '../src/internal/candidate.js'
import type { PackKind } from '../src/types.js'

/** A file's contents: a string written as-is, or a value serialised as JSON. */
export type FixtureFile = string | Record<string, unknown> | unknown[]

/**
 * Writes a workspace tree to a fresh temp directory and returns its absolute path. The directory
 * is removed when the running test finishes.
 *
 * Keys are POSIX-ish paths relative to the workspace root; a `string` value is written verbatim
 * (so a test can write invalid JSON), anything else is `JSON.stringify`d. Nothing is installed,
 * so every fixture is the clean checkout the kit must enumerate.
 */
export async function writeWorkspace(files: Record<string, FixtureFile>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-dev-kit-'))
  onTestFinished(() => rm(root, { force: true, recursive: true }))

  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`)
  }

  return root
}

/**
 * Runs the kit's own build over a fixture package, exactly as a consuming package's bundler
 * configuration would. No config file is loaded and the bundler is silent, so the case sees only
 * what the build wrote.
 */
export async function buildPackage(packageDir: string): Promise<void> {
  await build({ ...packBuild({ packageDir }), config: false, logLevel: 'silent' })
}

/** Every file under `dir` as a sorted POSIX path relative to it; empty where the directory is absent. */
export async function listTree(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
}

/** The fields a manifest fixture overrides, on top of a plausible pack of the given kind. */
export interface ManifestOverrides {
  format_version?: unknown
  header?: unknown
  modules?: unknown
  dependencies?: unknown
  [key: string]: unknown
}

/**
 * A plausible source manifest, so a case states only the field it is about. The header carries a
 * uuid and no name or version, as a partial source manifest does, and the modules corroborate the
 * kind. Any key given as `undefined` is dropped rather than written.
 */
export function packManifest(
  kind: 'behavior' | 'resource',
  overrides: ManifestOverrides = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    format_version: 2,
    header: {
      description: `a ${kind} pack`,
      uuid: kind === 'behavior' ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222',
    },
    modules: [
      {
        type: kind === 'behavior' ? 'data' : 'resources',
        uuid: '33333333-3333-3333-3333-333333333333',
        version: [1, 0, 0],
      },
    ],
  }

  return dropUndefined({ ...base, ...overrides })
}

/** Drops keys holding `undefined`, at every depth, so a fixture states absence by writing it. */
function dropUndefined(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.map(dropUndefined) as unknown as Record<string, unknown>
  }
  if (typeof value !== 'object' || value === null) {
    return value as Record<string, unknown>
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, dropUndefined(entry)]),
  )
}

/** What a working-entry fixture states: everything else follows from the package directory. */
export interface WorkingEntryOptions {
  kind?: PackKind
  packageDir?: string
  packageName?: string
  /** the owning `package.json`, defaulting to a named, versioned one */
  packageJson?: Record<string, unknown>
  /** the source manifest as parsed; `undefined` stands for one that could not be read */
  manifest?: unknown
  /** dotted paths the form pass faulted, as the locator would have recorded them */
  formFaults?: string[]
}

/**
 * A located entry as the locator would hand it to completion and validation, built in memory.
 * Neither stage reads the filesystem, so their cases need no fixture on disk.
 */
export function workingEntry({
  kind = 'behavior',
  packageDir = 'packages/mc-pack-1',
  packageJson = { name: '@scope/mc-pack-1', version: '1.2.3' },
  packageName = typeof packageJson.name === 'string' ? packageJson.name : path.basename(packageDir),
  manifest = packManifest(kind),
  formFaults = [],
}: WorkingEntryOptions = {}): WorkingEntry {
  const directory = kind === 'behavior' ? 'behavior_pack' : 'resource_pack'
  const prefix = packageDir === '.' ? '' : `${packageDir}/`
  const candidate: CandidatePackage = {
    packageDir,
    absoluteDir: path.posix.join('/workspace', packageDir),
    packageJson,
  }

  return {
    kind,
    packageName,
    packageDir,
    sourceDir: `${prefix}${directory}`,
    outputDir: `${prefix}dist/${directory}`,
    scriptOutput: kind === 'behavior' ? `${prefix}dist/${directory}/scripts/main.js` : null,
    package: candidate,
    manifest,
    formFaults: new Set(formFaults),
    problems: [],
  }
}
