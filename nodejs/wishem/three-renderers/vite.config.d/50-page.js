import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The settings of the page server. `scripts/react-page.ts` changes the port and the target of the proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    // The Vite client reloads the page when the server comes back, and a reload hides the new link.
    ws: false,
    proxy: { '^/link$': { target: 'http://127.0.0.1:4750', ws: true, changeOrigin: false } },
  },
})
