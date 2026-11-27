import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The first condition selects `src/`. The others are the defaults of Vite for a browser.
    conditions: ['source', 'module', 'browser', 'development|production'],
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
