import fs from 'node:fs'
import path from 'node:path'
import type { ProjectManifest } from '@pnpm/types'
import { execa } from 'execa'
import { getWorkspaceRoot } from './get-workspace-root.js'
import type { PackageMeta } from './package-meta.js'

/**
 * Finds all packages in the monorepo, and returns their name and path.
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
  const allPackages = JSON.parse(stdout) as { name: string; path: string }[]
  const packages = includeRoot ? allPackages : allPackages.filter((pkg) => pkg.path !== rootPath)

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
