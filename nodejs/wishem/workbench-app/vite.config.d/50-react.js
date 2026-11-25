import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The test build: `vite build --mode style-guide`.
const testBuild = /--mode[ =]style-guide/.test(process.argv.join(' '))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: testBuild ? 'dist-style-guide' : 'dist',
    rollupOptions: { input: testBuild ? 'style-guide.html' : 'index.html' },
  },
})
