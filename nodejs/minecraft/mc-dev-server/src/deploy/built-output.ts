import { readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import type { DesiredPack } from './plan.js'
import type { ValidPackEntry } from '@twin-digital/mc-dev-kit'

/** Lists a directory's files as pack-relative POSIX paths, sorted. An absent tree lists nothing. */
export const listFiles = async (dir: string): Promise<readonly string[]> => {
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
  files.sort()
  return files
}

/**
 * Reads the payload a pack contributes: the contents of its built-output location and nothing
 * about how that output was assembled. A pack whose output tree is absent contributes no files.
 *
 * The version is the one the pack set reports, in the form it reports it — no manifest in the
 * output tree is read.
 */
export const readBuiltOutput = async (workspaceRoot: string, entry: ValidPackEntry): Promise<DesiredPack> => {
  const sourceDir = resolve(workspaceRoot, entry.outputDir)
  return {
    uuid: entry.uuid.toLowerCase(),
    kind: entry.kind,
    version: entry.version,
    packageName: entry.packageName,
    files: await listFiles(sourceDir),
    sourceDir,
  }
}
