// This library ships inside a pack's script bundle: es2022 ESM on a neutral platform is what the
// Bedrock script engine accepts, and the shim prelude would import node:url. The engine provides
// the @minecraft/* modules at runtime, so they stay external; everything else still bundles.
// Tests stay out of dist, as the shared tsconfig.build.json keeps them out of tsc-built packages.
import type { UserConfig } from 'tsdown'

const config: Partial<UserConfig> = {
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  external: [/^@minecraft\//],
  format: 'esm',
  noExternal: (id: string) => !id.startsWith('@minecraft/'),
  platform: 'neutral',
  shims: false,
  target: 'es2022',
}

export default config
