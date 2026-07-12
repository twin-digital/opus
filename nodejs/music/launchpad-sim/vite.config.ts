import { existsSync, readdirSync } from 'node:fs'

import { defaultClientConditions, defineConfig, mergeConfig, type UserConfig } from 'vite'

// Base config: resolve workspace dependencies straight to their src/ (the monorepo's
// source-first convention, mirroring tsconfig's customConditions). Project overrides:
// any 'vite.config.d/*.js' config fragments (merged in filename order via mergeConfig)
// extend the base. repo-kit features and packages drop fragments there instead of
// editing this file.
const base: UserConfig = {
  resolve: {
    conditions: ['source', ...defaultClientConditions],
  },
}

const fragmentsDir = new URL('./vite.config.d/', import.meta.url)

let config = base
if (existsSync(fragmentsDir)) {
  const files = readdirSync(fragmentsDir)
    .filter((file) => file.endsWith('.js'))
    .sort()
  for (const file of files) {
    const fragment = (await import(new URL(file, fragmentsDir).href)) as { default: UserConfig }
    config = mergeConfig(config, fragment.default)
  }
}

export default defineConfig(config)
