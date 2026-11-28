// Managed by repo-kit. The shared base config lives in
// @twin-digital/vitest-config; per-package overrides go in a sibling
// vitest.config.d/*.ts (default-exported partial configs, deep-merged
// in filename order) — never in this file.
import { defineConfig, mergeConfig } from 'vitest/config'
import { defineTestConfig } from '@twin-digital/vitest-config'

export default mergeConfig(
  await defineTestConfig(import.meta.url),
  defineConfig({
    test: {
      environment: 'jsdom',
    },
  }),
)
