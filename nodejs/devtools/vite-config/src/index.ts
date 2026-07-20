import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defaultClientConditions, mergeConfig, type UserConfig } from 'vite'

/**
 * The shared base: resolve workspace dependencies straight to their `src/` (the
 * monorepo's source-first convention, mirroring tsconfig's customConditions).
 */
export const base: UserConfig = {
  resolve: {
    conditions: ['source', ...defaultClientConditions],
  },
}

/**
 * Compose {@link base} with a package's per-package overrides: any
 * `vite.config.d/*.js` next to the calling `vite.config.ts` default-exports a
 * partial config, deep-merged via vite's `mergeConfig` in filename order. Pass
 * `import.meta.url`.
 *
 * This is what the repo-kit-managed `vite.config.ts` calls, so the compose logic
 * lives here once instead of being inlined into every app. Mirrors the
 * `eslint.config.d/` / `tsdown.config.d/` override pattern.
 */
export async function defineAppConfig(configUrl: string): Promise<UserConfig> {
  const fragmentsDir = new URL('./vite.config.d/', configUrl)
  let config = base

  if (existsSync(fileURLToPath(fragmentsDir))) {
    const files = readdirSync(fileURLToPath(fragmentsDir))
      .filter((file) => file.endsWith('.js'))
      .sort()
    for (const file of files) {
      const fragment = (await import(new URL(file, fragmentsDir).href)) as { default: UserConfig }
      config = mergeConfig(config, fragment.default)
    }
  }

  return config
}
