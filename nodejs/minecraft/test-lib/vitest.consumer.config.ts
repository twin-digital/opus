// The consumer's-eye view: this config is what a pack author writes, and the plugin is its one
// entry. The `source` condition is local scaffolding — it lets the suite run against src/ with no
// build first, where a real consumer resolves the published dist. That published shape is measured
// separately, by installing an `npm pack` tarball into a scratch consumer.
import { minecraftTestLib } from './src/vitest/index.js'

export default {
  environments: { ssr: { resolve: { conditions: ['source'] } } },
  plugins: [minecraftTestLib()],
  test: {
    include: ['consumer/**/*.test.ts'],
  },
}
