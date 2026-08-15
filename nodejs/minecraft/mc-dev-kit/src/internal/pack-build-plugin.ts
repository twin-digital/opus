import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Rolldown } from 'tsdown'
import { discoverPacks } from '../discover-packs.js'
import type { PackEntry, ValidPackEntry } from '../types.js'
import { resolveWorkspaceRoot } from '../workspace-root.js'
import { bytesMatch, listFiles, pruneTree, writeIfChanged } from './build-outputs.js'
import { messageOf } from './json.js'

/** The one plugin the fragment carries. */
export type BuildPlugin = Rolldown.Plugin

/** Where a behavior pack's script sources sit, relative to the package directory. */
export const SCRIPT_SOURCE = 'behavior_pack/scripts/main.ts'

/** Where the configuration points the bundler, relative to the package's output root. */
export const SCRIPT_OUTPUT = 'behavior_pack/scripts/main.js'

/** The directory a package's build owns, relative to the package directory. */
export const OUTPUT_ROOT = 'dist'

/**
 * The entry the configuration names when the package holds no script sources. The plugin resolves
 * it to an empty module, so a script-less pack still builds; a build configured with it fails at
 * `buildStart` when the sources turn out to be on disk after all, rather than writing an empty
 * bundle over them.
 */
export const PACK_ENTRY = 'mc-dev-kit:pack-entry'

/** The resolved id the virtual entry loads under. */
export const RESOLVED_PACK_ENTRY = `\0${PACK_ENTRY}`

/** Options the fragment hands the plugin. */
export interface PackBuildPluginOptions {
  /** the namespace setting as the consumer wrote it; resolved against the package name at buildStart */
  namespace?: boolean | string
  /** the absolute path of the package directory the build is for */
  packageDir: string
  /** whether the configuration named the virtual entry rather than the script sources */
  virtualEntry: boolean
}

/** What `buildStart` worked out, and the later hooks act on. */
interface BuildState {
  packs: ValidPackEntry[]
  externals: Set<string>
  /** absolute paths this build is entitled to leave in the output tree */
  claimed: Set<string>
}

/**
 * The Rolldown plugin that performs the whole pack build.
 *
 * - `buildStart` resolves the workspace root by ascent, calls the kit's discovery, and takes this
 *   package's packs from the pack set. No pack, an invalid pack, an enumeration the kit rejects, or
 *   a script location that is not the one the configuration points at each fails the build.
 * - `resolveId` answers the virtual entry, and marks each `module_name` dependency the completed
 *   manifests declare external.
 * - `buildStart` also registers the extra watch inputs: the pack source directories, the source
 *   manifests, this package's `package.json`, and the `package.json` of each workspace package a
 *   pack depends on.
 * - `generateBundle` drops any chunk whose bytes already sit at its output path, so the bundler
 *   rewrites nothing that did not change.
 * - `writeBundle` writes the completed manifests and copies every other pack file, each only where
 *   its bytes differ, then prunes the output the build did not write.
 */
export function packBuildPlugin(options: PackBuildPluginOptions): BuildPlugin {
  const packageDir = path.resolve(options.packageDir)
  const outputRoot = path.join(packageDir, OUTPUT_ROOT)
  const scriptSource = path.join(packageDir, SCRIPT_SOURCE)
  const scriptOutput = path.join(outputRoot, SCRIPT_OUTPUT)

  let state: BuildState = emptyState()

  return {
    name: 'mc-dev-kit:pack-build',

    async buildStart() {
      state = emptyState()

      if (options.virtualEntry && existsSync(scriptSource)) {
        throw new Error(
          `the build was configured with no entry but ${SCRIPT_SOURCE} is on disk in ${packageDir}: the configuration was read before those sources existed, so re-run the build`,
        )
      }

      const workspace = await resolveWorkspaceRoot({ from: packageDir })
      if (workspace === undefined) {
        throw new Error(`no workspace root above ${packageDir}: no ancestor declares a pnpm or npm workspace`)
      }

      const all = await readPackSet(workspace.root)
      const mine = all.filter((pack) => path.resolve(workspace.root, pack.packageDir) === packageDir)

      if (mine.length === 0) {
        throw new Error(`no pack found in ${packageDir}: it holds neither behavior_pack nor resource_pack`)
      }

      const invalid = mine.filter((pack) => pack.status === 'invalid')
      if (invalid.length > 0) {
        throw new Error(`the packs of ${packageDir} did not resolve:\n${describeProblems(invalid)}`)
      }

      const packs = mine as ValidPackEntry[]
      checkScriptLocation(workspace.root, scriptOutput, packs)

      if (declaresScriptModule(packs)) {
        if (!existsSync(scriptSource)) {
          throw new Error(
            `the behavior pack of ${packageDir} declares a script module but ${SCRIPT_SOURCE} is not there`,
          )
        }
        state.claimed.add(scriptOutput)
      }

      state.packs = packs
      state.externals = moduleDependencies(packs)

      for (const input of watchInputs(workspace.root, packageDir, packs, all)) {
        this.addWatchFile(input)
      }
    },

    async resolveId(id: string, importer: string | undefined, extra) {
      if (id === PACK_ENTRY) {
        return RESOLVED_PACK_ENTRY
      }
      if (state.externals.has(id)) {
        return { id, external: true }
      }
      if (!id.startsWith('@minecraft/')) {
        return null
      }

      // an undeclared game module is a plain import: it must be bundled, so it must resolve
      const resolved = await this.resolve(id, importer, { ...extra, skipSelf: true })
      if (resolved === null) {
        throw new Error(
          `${id} is imported by ${importer ?? 'the entry'} but the completed manifest does not declare it as a module dependency, and nothing importable resolves for it`,
        )
      }
      return resolved
    },

    load(id: string) {
      return id === RESOLVED_PACK_ENTRY ? 'export {}\n' : null
    },

    async generateBundle(outputOptions, bundle) {
      const dir = outputOptions.dir ?? path.dirname(scriptOutput)

      for (const [fileName, file] of Object.entries(bundle)) {
        const contents = Buffer.from(file.type === 'chunk' ? file.code : file.source)
        if (await bytesMatch(path.resolve(dir, fileName), contents)) {
          Reflect.deleteProperty(bundle, fileName)
        }
      }
    },

    async writeBundle() {
      for (const pack of state.packs) {
        await writePack(packageDir, pack, state.claimed)
      }
      await pruneTree(outputRoot, state.claimed)
    },
  }
}

/** A build's state before `buildStart` has read anything. */
function emptyState(): BuildState {
  return { packs: [], externals: new Set(), claimed: new Set() }
}

/**
 * The whole workspace's pack set. A rejected enumeration is a distinct failure from a pack the kit
 * reports invalid, and an unrelated package in the workspace can cause it, so the message says
 * which workspace was read and carries the underlying error, which names the file.
 */
async function readPackSet(workspaceRoot: string): Promise<readonly PackEntry[]> {
  try {
    return await discoverPacks({ workspace: workspaceRoot })
  } catch (error) {
    throw new Error(`the workspace at ${workspaceRoot} could not be read: ${messageOf(error)}`, { cause: error })
  }
}

/** The kit's problems, one per line, so a failing build says what to fix. */
function describeProblems(packs: readonly PackEntry[]): string {
  return packs
    .flatMap((pack) => pack.problems.map((problem) => `  ${pack.sourceDir}: ${problem.code}: ${problem.message}`))
    .join('\n')
}

/**
 * Fails the build where the pack set reports a script location the configuration does not point
 * at. A pack for which the pack set reports none — every resource pack — is not a mismatch.
 */
function checkScriptLocation(workspaceRoot: string, expected: string, packs: readonly ValidPackEntry[]): void {
  for (const pack of packs) {
    if (pack.scriptOutput === null) {
      continue
    }
    const reported = path.resolve(workspaceRoot, pack.scriptOutput)
    if (reported !== expected) {
      throw new Error(`the pack set reports the script of ${pack.sourceDir} at ${reported}, not at ${expected}`)
    }
  }
}

/** Whether any of the package's packs declares a script module, and so claims a built bundle. */
function declaresScriptModule(packs: readonly ValidPackEntry[]): boolean {
  return packs.some((pack) => pack.manifest.modules.some((module) => module.type === 'script'))
}

/** The `module_name` dependencies the completed manifests declare — the whole of the external set. */
function moduleDependencies(packs: readonly ValidPackEntry[]): Set<string> {
  const names = new Set<string>()
  for (const pack of packs) {
    for (const dependency of pack.manifest.dependencies ?? []) {
      if (typeof dependency.module_name === 'string') {
        names.add(dependency.module_name)
      }
    }
  }
  return names
}

/**
 * The inputs a change to which must rebuild: the pack source directories — registered as
 * directories, so an asset added later triggers one — the source manifests, this package's
 * `package.json`, and the `package.json` of each workspace package a pack depends on.
 */
function watchInputs(
  workspaceRoot: string,
  packageDir: string,
  packs: readonly ValidPackEntry[],
  all: readonly PackEntry[],
): string[] {
  const inputs = new Set<string>([path.join(packageDir, 'package.json')])
  const byUuid = new Map(all.filter((pack) => pack.uuid !== undefined).map((pack) => [pack.uuid as string, pack]))

  for (const pack of packs) {
    const sourceDir = path.resolve(workspaceRoot, pack.sourceDir)
    inputs.add(sourceDir)
    inputs.add(path.join(sourceDir, 'manifest.json'))

    for (const dependency of pack.manifest.dependencies ?? []) {
      const uuid = typeof dependency.uuid === 'string' ? dependency.uuid.toLowerCase() : undefined
      const depended = uuid === undefined ? undefined : byUuid.get(uuid)
      if (depended !== undefined) {
        inputs.add(path.resolve(workspaceRoot, depended.packageDir, 'package.json'))
      }
    }
  }

  return [...inputs]
}

/**
 * Writes one pack's output: the completed manifest, and every source file but that manifest and
 * the script sources. Each write is compared first, and every path written joins the claimed set
 * the prune spares.
 */
async function writePack(packageDir: string, pack: ValidPackEntry, claimed: Set<string>): Promise<void> {
  const sourceDir = path.join(packageDir, path.basename(pack.sourceDir))
  const outputDir = path.join(packageDir, OUTPUT_ROOT, path.basename(pack.outputDir))

  const manifest = path.join(outputDir, 'manifest.json')
  claimed.add(manifest)
  await writeIfChanged(manifest, Buffer.from(`${JSON.stringify(pack.manifest, null, 2)}\n`))

  for (const file of await listFiles(sourceDir)) {
    const relative = path.relative(sourceDir, file)
    if (relative === 'manifest.json' || relative.split(path.sep)[0] === 'scripts') {
      continue
    }
    const target = path.join(outputDir, relative)
    claimed.add(target)
    await writeIfChanged(target, await readFile(file))
  }
}
