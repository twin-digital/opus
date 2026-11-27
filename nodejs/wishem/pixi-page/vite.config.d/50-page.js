import { defineConfig } from 'vite'

// The settings of the page server. `scripts/start.ts` changes the port and the target of the proxy.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    // The HMR client reloads the page when the server comes back, and a reload hides the new link.
    hmr: false,
    proxy: { '^/link$': { target: 'http://127.0.0.1:4748', ws: true, changeOrigin: false } },
  },
})
