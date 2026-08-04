// The consumer's-eye view: this config is what a pack author writes, and the plugin is its one
// entry. The `source` condition is local scaffolding — it lets the suite run against src/ without
// a build first, where a real consumer resolves the published dist.
import { minecraftTestLib } from './dist/vitest/index.js'

export default {
  plugins: [minecraftTestLib()],
  test: {
    include: ['consumer/**/*.test.ts'],
  },
}
