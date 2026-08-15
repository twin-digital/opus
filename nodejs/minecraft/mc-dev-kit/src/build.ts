import { existsSync } from 'node:fs'
import path from 'node:path'
import type { UserConfig } from 'tsdown'
import { PACK_ENTRY, SCRIPT_SOURCE, packBuildPlugin } from './internal/pack-build-plugin.js'

/** Options for {@link packBuild}. */
export interface PackBuildOptions {
  /** the filesystem path of the package directory the build is for */
  packageDir: string
  /**
   * Turns namespacing on: every identifier the package's packs declare is built carrying the
   * namespace, written into no name by hand. `true` derives the namespace from the package's own
   * name — the `@` dropped and the `/` a hyphen — and a string names one directly. A namespace
   * holds only lowercase letters, digits, underscore, hyphen and dot; anything else fails the
   * build naming the character. Left unset, nothing is namespaced and names reach the output as
   * the source spells them — unless the package vendors anything, which needs a namespace and
   * fails the build without one.
   *
   * Entity identifiers and the localization keys derived from them carry the namespace; every
   * other declared name — geometry, textures, materials, render controllers, animations,
   * animation controllers — carries the pack's asset namespace, derived from its header uuid.
   * Script sources are never rewritten: code spells identifiers through
   * `@twin-digital/mc-pack-runtime`'s `packId`, which reads the namespace the build injects into
   * the bundle. A namespace chosen by hand is conventionally claimed at the Bedrock-OSS add-on
   * registry (https://github.com/Bedrock-OSS/add-on-registry); the build neither reads the
   * registry nor requires an entry in it.
   */
  namespace?: boolean | string
}

/**
 * The build half of the dev kit: a tsdown config fragment a pack package's bundler configuration
 * takes up, which builds every pack the package holds.
 *
 * The fragment's `plugins` array holds the one plugin that performs the whole build — it reads the
 * package's packs from the kit's pack set, completes their manifests, copies their assets, and
 * prunes output the build did not write. The bundler writes the script bundle and the plugin
 * writes everything else, so a finished build loads as it stands with nothing further to do.
 *
 * With `namespace` set, the plugin also rewrites every name the packs declare, merges the
 * `vendored_pack/` content of the package's dependencies into its own packs, injects the
 * namespace into the bundle for `@twin-digital/mc-pack-runtime` to read, stamps a type family on
 * every declared entity type, and adds the pack's claim entity type.
 *
 * Every setting the build depends on is set here rather than inherited, so the fragment behaves
 * the same merged over a shared base as it does alone. `target` is `es2022` and `platform` is
 * `neutral` because that is what the Bedrock script engine accepts, `shims` is false because the
 * shim prelude imports `node:url`, `format` is `esm` because a CommonJS wrapper fails on `module`,
 * and `clean` is false because emptying the output directory would take the end-of-build prune's
 * inputs with it.
 *
 * A package whose behavior pack carries no `behavior_pack/scripts/main.ts` builds through a
 * virtual entry, so a script-less pack and a resource-pack-only package both build; the chunk
 * nothing claims is pruned at the end of the build.
 *
 * In the opus monorepo the fragment reaches the configuration through a `tsdown.config.d/` file:
 *
 * ```ts
 * import { packBuild } from '@twin-digital/mc-dev-kit/build'
 *
 * export default packBuild({ packageDir: new URL('..', import.meta.url).pathname })
 * ```
 *
 * The package's `dist/` becomes the build's to own and prune, so a package taking up the fragment
 * devotes its bundler configuration to its packs.
 *
 * @param options - `packageDir` is the package directory the build is for
 * @returns the config fragment, ready to merge over a package's bundler base
 */
export function packBuild(options: PackBuildOptions): UserConfig {
  const packageDir = path.resolve(options.packageDir)
  const scriptSource = path.join(packageDir, SCRIPT_SOURCE)
  const virtualEntry = !existsSync(scriptSource)

  return {
    clean: false,
    dts: false,
    entry: [virtualEntry ? PACK_ENTRY : scriptSource],
    format: 'esm',
    inputOptions: { resolve: { conditionNames: ['source'] } },
    minify: false,
    noExternal: () => true,
    outDir: path.join(packageDir, 'dist', 'behavior_pack', 'scripts'),
    outputOptions: { entryFileNames: 'main.js' },
    platform: 'neutral',
    plugins: [packBuildPlugin({ namespace: options.namespace, packageDir, virtualEntry })],
    shims: false,
    sourcemap: false,
    target: 'es2022',
  }
}
