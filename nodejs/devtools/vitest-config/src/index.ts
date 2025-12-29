export const sharedConfig = {
  // allow usage of 'source' export condition so that we don't need to pre-build dependencies to run tests
  environments: {
    // vitest uses the 'ssr' environment of vite
    ssr: {
      resolve: {
        conditions: ['source', 'module', 'browser', 'development|production'],
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

// Re-export specific configs for backwards compatibility
export { baseConfig } from './base.js'
export { uiConfig } from './ui.js'
