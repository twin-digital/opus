import { sharedConfig } from '@twin-digital/vitest-config'

// `consumer/` is the package's own consumer's-eye suite: it runs under the plugin, from
// vitest.consumer.config.ts, and cannot resolve `@minecraft/server` without it.
export default {
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    exclude: [...sharedConfig.test.exclude, 'consumer/**'],
  },
}
