// The pack's tests import `@minecraft/server`, which only resolves under the test lib's
// plugin: it aliases the module family to the fakes and installs a fresh server per test
// file. See @twin-digital/minecraft-test-lib/vitest.
import { fileURLToPath } from 'node:url'

import { minecraftTestLib } from '@twin-digital/minecraft-test-lib/vitest'

// This file is loaded by node, which has no `source` condition, so the plugin's shim and
// setup paths are the lib's dist. A test file resolving the lib under `source` would get a
// second copy, whose server the pack under test never sees — so both specifiers are pinned
// to the copy loaded here.
const testLib = (specifier: string) => fileURLToPath(import.meta.resolve(specifier))

export default {
  plugins: [minecraftTestLib()],
  resolve: {
    alias: [
      {
        find: /^@twin-digital\/minecraft-test-lib$/,
        replacement: testLib('@twin-digital/minecraft-test-lib'),
      },
      {
        find: /^@twin-digital\/minecraft-test-lib\/vitest$/,
        replacement: testLib('@twin-digital/minecraft-test-lib/vitest'),
      },
    ],
  },
}
