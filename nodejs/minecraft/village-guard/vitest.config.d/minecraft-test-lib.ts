// The pack's tests import `@minecraft/server`, which only resolves under the test lib's
// plugin: it aliases the module family to the fakes and installs a fresh server per test
// file. See @twin-digital/minecraft-test-lib/vitest.
import { minecraftTestLib } from '@twin-digital/minecraft-test-lib/vitest'

export default {
  plugins: [minecraftTestLib()],
}
