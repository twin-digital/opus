import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // The app uses top-level await, which Vite's default browser targets reject.
    target: 'esnext',
  },
})
