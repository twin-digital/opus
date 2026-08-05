import { mergeConfig } from 'vitest/config'

import { sharedConfig } from '@twin-digital/vitest-config'

// the loop tests spawn a package's own scripts through its package manager, which is slower than
// the shared default allows for
export default mergeConfig(sharedConfig, { test: { testTimeout: 30_000, hookTimeout: 30_000 } })
