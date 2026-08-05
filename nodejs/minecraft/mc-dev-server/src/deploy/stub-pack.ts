import { posix } from 'node:path'

import type { ValidPackEntry } from '@twin-digital/mc-dev-kit'

/** The script a stub deploys in place of a bundle that would not build. */
export const STUB_SCRIPT = '// mc-dev-server: this pack did not build; its script does nothing.\nexport {}\n'

/**
 * The payload a pack is deployed with when its build failed or it declares no `build` script: its
 * own identity, version and content from the pack set, and a script that does nothing.
 *
 * The stub sits where the bundle will sit, so the first build that succeeds replaces it without
 * the pack's file set growing — which is what keeps the fix at a reload rather than a restart.
 */
export const stubPayload = (entry: ValidPackEntry): Record<string, string> => {
  const files: Record<string, string> = {
    'manifest.json': `${JSON.stringify(entry.manifest, undefined, 2)}\n`,
  }

  const { scriptOutput } = entry
  const declaresScript = entry.manifest.modules.some((module) => module.type === 'script')
  if (declaresScript && typeof scriptOutput === 'string') {
    files[posix.relative(entry.outputDir, scriptOutput)] = STUB_SCRIPT
  }

  return files
}
