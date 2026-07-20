import { fileURLToPath } from 'node:url'

import { mergeConfig } from 'vitest/config'
import { sharedConfig } from '@twin-digital/vitest-config'

// @minecraft/server ships only type declarations (no runtime entry), so vitest
// can't resolve it. Alias it to a local runtime stub; unit tests drive the small
// surface the library actually touches. (Hand-managed rather than repo-kit's
// generated `export default sharedConfig` — see the opt-out in .repo-kit.yml.)
export default mergeConfig(sharedConfig, {
  test: {
    alias: {
      '@minecraft/server': fileURLToPath(new URL('./test/minecraft-server.stub.ts', import.meta.url)),
    },
  },
})
