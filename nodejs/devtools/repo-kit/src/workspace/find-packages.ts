import fs from 'node:fs'
import path from 'node:path'
import type { ProjectManifest } from '@pnpm/types'
import { execa } from 'execa'
import { getWorkspaceRoot } from './get-workspace-root.js'
import type { PackageMeta } from './package-meta.js'

/**
 * Orders packages by absolute path, comparing UTF-16 code units so the result is independent of locale and of the
 * order `pnpm list` happens to emit (which differs between pnpm major versions).
 */
const byPath = (a: { path: string }, b: { path: string }): number => {
  if (a.path === b.path) {
    return 0
  }
  return a.path < b.path ? -1 : 1
}

/**
 * Finds all packages in the monorepo, and returns their name and path. Packages are sorted by path, and every
 * returned path is absolute and normalized, so it can be compared directly against `getWorkspaceRoot()`.
 */
export const findPackages = async ({
  includeRoot = false,
}: {
  /**
   * Whether the root package should be included or not.
   * @defaultValue false
   */
  includeRoot?: boolean
} = {}): Promise<PackageMeta[]> => {
  const { stdout } = await execa({
    encoding: 'utf8',
  })`pnpm list -r --depth -1 --json`

  const rootPath = await getWorkspaceRoot()
  const allPackages = (JSON.parse(stdout) as { name: string; path: string }[]).map((pkg) => ({
    name: pkg.name,
    path: path.resolve(rootPath, pkg.path),
  }))
  const packages = (includeRoot ? allPackages : allPackages.filter((pkg) => pkg.path !== rootPath)).sort(byPath)

  return Promise.all(
    packages.map(async (pkg) => {
      const manifestPath = path.resolve(pkg.path, 'package.json')
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as ProjectManifest
      return {
        manifest,
        name: pkg.name,
        path: pkg.path,
      }
    }),
  )
}
