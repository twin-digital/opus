export const sharedConfig = {
  test: {
    globals: true,
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

// Re-export specific configs for backwards compatibility
export { baseConfig } from './base.js'
export { uiConfig } from './ui.js'
