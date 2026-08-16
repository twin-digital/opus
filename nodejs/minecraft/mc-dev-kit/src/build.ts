import { existsSync } from 'node:fs'
import path from 'node:path'
import type { UserConfig } from 'tsdown'
import { PACK_ENTRY, SCRIPT_SOURCE, packBuildPlugin } from './internal/pack-build-plugin.js'

/** Options for {@link packBuild}. */
export interface PackBuildOptions {
  /** the filesystem path of the package directory the build is for */
  packageDir: string
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
 * Every setting the build depends on is set here rather than inherited, so the fragment behaves
 * the same merged over a shared base as it does alone. `target` is `es2022` and `platform` is
 * `neutral` because that is what the Bedrock script engine accepts, `shims` is false because the
 * shim prelude imports `node:url`, `format` is `esm` because a CommonJS wrapper fails on `module`,
 * and `clean` is false because emptying the output directory would take the end-of-build prune's
 * inputs with it.
 *
 * A package that carries no `src/main.ts` builds through a virtual entry, so a script-less pack
 * and a resource-pack-only package both build; the chunk nothing claims is pruned at the end of
 * the build.
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
    plugins: [packBuildPlugin({ packageDir, virtualEntry })],
    shims: false,
    sourcemap: false,
    target: 'es2022',
  }
}
