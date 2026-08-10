import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defaultClientConditions } from 'vite'
import { defineConfig } from 'vitest/config'

// jsdom comes from the generated vitest.config.ts (repo-kit's React branch). This adds
// what the component tests need on top: the JSX transform, the `@/` alias the source
// imports through, and jest-dom's matchers.
//
// The `source` condition is repeated here because the shared vitest config sets it on
// vitest's `ssr` environment only. A jsdom suite resolves through the *client*
// environment, which would otherwise miss the workspace packages' `source` entry and
// demand a built `dist/` from @grinbox/shared and @grinbox/server.
export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source', ...defaultClientConditions],
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
