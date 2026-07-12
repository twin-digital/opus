import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  build: {
    // The app uses top-level await, which Vite's default browser targets reject.
    target: 'esnext',
  },
  resolve: {
    // Resolve workspace dependencies straight to their src/ (the monorepo's
    // source-first convention), keeping Vite's own defaults in place.
    conditions: ['source', ...defaultClientConditions],
  },
})
