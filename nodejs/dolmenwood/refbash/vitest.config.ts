import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '@twin-digital/vitest-config'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
    },
  }),
)
