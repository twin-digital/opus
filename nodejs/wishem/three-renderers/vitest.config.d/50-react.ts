import react from '@vitejs/plugin-react'
import { defaultClientConditions } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source', ...defaultClientConditions],
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
