import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { mergeConfig, type ViteUserConfig } from 'vitest/config'

/**
 * The shared base: resolve workspace dependencies straight to their `src/` (the
 * monorepo's source-first convention), plus the repo's coverage and exclude defaults.
 */
export const sharedConfig = {
  // allow usage of 'source' export condition so that we don't need to pre-build dependencies to run tests
  environments: {
    // vitest uses the 'ssr' environment of vite
    ssr: {
      resolve: {
        conditions: ['source'],
      },
    },
  },
  test: {
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rolldown,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsdown,tsup,build}.config.*',
    ],
    coverage: {
      provider: 'istanbul' as const,
      reporter: [
        [
          'json',
          {
            file: `../coverage.json`,
          },
        ],
      ] as const,
      enabled: true,
    },
  },
}

/**
 * Compose {@link sharedConfig} with a package's per-package overrides: any
 * `vitest.config.d/*.ts` next to the calling `vitest.config.ts` default-exports a
 * partial config, deep-merged via vite's `mergeConfig` in filename order. Pass
 * `import.meta.url`.
 *
 * This is what the repo-kit-managed `vitest.config.ts` calls, so the compose logic
 * lives here once instead of being inlined into every package. Mirrors the
 * `eslint.config.d/` / `tsdown.config.d/` / `vite.config.d/` override pattern.
 */
export async function defineTestConfig(configUrl: string): Promise<ViteUserConfig> {
  const fragmentsDir = new URL('./vitest.config.d/', configUrl)
  // sharedConfig's inferred literal types are narrower than ViteUserConfig's; the merge is structural.
  let config: Record<string, unknown> = sharedConfig

  if (existsSync(fileURLToPath(fragmentsDir))) {
    const files = readdirSync(fileURLToPath(fragmentsDir))
      .filter((file) => file.endsWith('.ts'))
      .sort()
    for (const file of files) {
      const fragment = (await import(new URL(file, fragmentsDir).href)) as { default: ViteUserConfig }
      config = mergeConfig(config, fragment.default)
    }
  }

  return config
}

// Re-export specific configs for backwards compatibility
export { baseConfig } from './base.js'
export { uiConfig } from './ui.js'
