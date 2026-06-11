import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIP = new Set(['node_modules', '.git', 'dist'])

/**
 * Find every workspace `package.json` under the given group roots, returned as paths **relative to**
 * `root` (so they compose with `git show <ref>:<relpath>`).
 */
export const findManifestPaths = (root: string, groups: string[] = ['nodejs', 'tooling']): string[] => {
  const results: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP.has(entry)) {
        continue
      }
      const full = join(dir, entry)
      let isDir: boolean
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        walk(full)
      } else if (entry === 'package.json') {
        results.push(relative(root, full))
      }
    }
  }
  for (const group of groups) {
    walk(join(root, group))
  }
  return results
}
