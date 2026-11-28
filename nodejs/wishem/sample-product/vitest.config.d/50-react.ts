import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // After "source": the client conditions of Vite
    conditions: ['source', 'module', 'browser', 'development|production'],
  },
  test: {
    environment: 'jsdom',
  },
})
