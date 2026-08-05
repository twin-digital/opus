import type { Rolldown } from 'tsdown'

/** The one plugin the fragment carries. */
export type BuildPlugin = Rolldown.Plugin

/** Where a behavior pack's script sources sit, relative to the package directory. */
export const SCRIPT_SOURCE = 'behavior_pack/scripts/main.ts'

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
  /** the absolute path of the package directory the build is for */
  packageDir: string
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
  const { packageDir } = options

  return {
    name: 'mc-dev-kit:pack-build',

    buildStart() {
      throw new Error(`pack build is not implemented yet (${packageDir})`)
    },

    resolveId(id: string) {
      return id === PACK_ENTRY ? RESOLVED_PACK_ENTRY : null
    },

    load(id: string) {
      return id === RESOLVED_PACK_ENTRY ? 'export {}\n' : null
    },
  }
}
