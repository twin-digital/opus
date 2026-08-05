import type { DesiredPack } from './plan.js'
import type { ValidPackEntry } from '@twin-digital/mc-dev-kit'

/**
 * Reads the payload a pack contributes: the contents of its built-output location and nothing
 * about how that output was assembled. A pack whose output tree is absent contributes no files.
 */
export const readBuiltOutput = (_workspaceRoot: string, _entry: ValidPackEntry): Promise<DesiredPack> => {
  throw new Error('not implemented: readBuiltOutput')
}

/** Lists a directory's files as pack-relative POSIX paths, sorted. */
export const listFiles = (_dir: string): Promise<readonly string[]> => {
  throw new Error('not implemented: listFiles')
}
