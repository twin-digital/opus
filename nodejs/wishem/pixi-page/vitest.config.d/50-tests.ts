import { defineConfig } from 'vitest/config'

// Playwright specs in tests/ run with test:ui, not Vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
