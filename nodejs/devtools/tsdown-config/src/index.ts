import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { UserConfig } from 'tsdown'

/**
 * The shared bundle base. Bundles everything (workspace deps are inlined via the
 * `source` condition; anything unresolvable — e.g. runtime-provided modules — is
 * left external by rolldown). A package gets this as-is unless it overrides.
 */
export const base: UserConfig = {
  dts: true,
  entry: 'src/**/*.ts',
  fixedExtension: false,
  hash: false,
  inputOptions: {
    resolve: {
      conditionNames: ['source'],
    },
  },
  noExternal: () => true,
  shims: true,
  unbundle: false,
}

/**
 * Compose {@link base} with a package's per-package overrides.
 *
 * Overrides live next to the calling `tsdown.config.ts` in a `tsdown.config.d/`
 * directory: each `*.ts` file default-exports a partial config, applied in
 * filename order and **shallow-merged** over the base (a top-level key replaces
 * the base's wholesale — so if you override a nested key like `inputOptions`,
 * re-include what you still need from the base). Most overrides are top-level
 * scalars (`entry`, `external`, `dts`, `format`, …), for which shallow merge is
 * exactly right.
 *
 * Usage — the whole managed `tsdown.config.ts` is:
 * ```ts
 * import { defineBundleConfig } from '@twin-digital/tsdown-config'
 * export default await defineBundleConfig(import.meta.url)
 * ```
 */
export async function defineBundleConfig(configUrl: string): Promise<UserConfig> {
  const overridesDir = new URL('./tsdown.config.d/', configUrl)
  let config: UserConfig = { ...base }

  if (existsSync(overridesDir)) {
    const files = readdirSync(fileURLToPath(overridesDir))
      .filter((file) => file.endsWith('.ts'))
      .sort()
    for (const file of files) {
      const fragment = (await import(new URL(file, overridesDir).href)) as {
        default: Partial<UserConfig>
      }
      config = { ...config, ...fragment.default }
    }
  }

  return config
}
