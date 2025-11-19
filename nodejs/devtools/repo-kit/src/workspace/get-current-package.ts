import fs from 'fs'
import path from 'path'
import type { PackageMeta } from './package-meta.js'
import type { PackageManifest } from '@pnpm/types'

/**
 * Walks up from the given directory to find the nearest ancestor containing a package.json
 * @param startDir - Directory to start searching from (defaults to process.cwd())
 * @returns Absolute path to the directory containing package.json, or null if none found
 */
const findNearestPackageJson = (startDir: string): string | null => {
  let currentDir = startDir

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- loop only terminates via break
  while (true) {
    const pkgPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  return null
}

/**
 * Returns the metadata for the "current" package, relative to the specified working directory. The current package is
 * the package containing the directory. This works by looking for the nearest package.json in the directory (and its
 * ancestors) and return its metadata. If there are no package.json files found, an Error will be thrown.
 *
 * @param cwd - Directory for which to find the package (defaults to process.cwd())
 */
export const getCurrentPackage = async (cwd: string = process.cwd()): Promise<PackageMeta> => {
  const packageDir = findNearestPackageJson(cwd)
  if (packageDir === null) {
    throw new Error(`No package.json found in any ancestor of "${cwd}".`)
  }

  const manifest = JSON.parse(
    await fs.promises.readFile(path.resolve(packageDir, 'package.json'), 'utf-8'),
  ) as PackageManifest

  return {
    manifest,
    name: manifest.name,
    path: packageDir,
  }
}
