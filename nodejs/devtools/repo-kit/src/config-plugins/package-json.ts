import fs from 'fs'
import path from 'path'
import type { ProjectManifest } from '@pnpm/types'
import type { PackageMeta } from '../workspace/package-meta.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isEqual from 'lodash-es/isEqual.js'
import pull from 'lodash-es/pull.js'

const alignExports = async (
  manifest: ProjectManifest,
  packagePath: string,
): Promise<ProjectManifest> => {
  const hasBarrelFile = (directory: string) =>
    fs.existsSync(path.join(directory, 'index.ts'))

  const hasAnySubBarrelFiles = (directory: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        hasBarrelFile(path.join(directory, entry.name))
      ) {
        return true
      }
    }

    return false
  }

  const newExports: Record<string, any> = {}

  const srcDir = path.join(packagePath, 'src')
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    if (hasBarrelFile(srcDir)) {
      newExports['.'] = {
        import: './dist/index.js',
        types: './dist/index.d.ts',
      }
    }

    if (hasAnySubBarrelFiles(srcDir)) {
      newExports['./*'] = {
        import: './dist/*/index.js',
        types: './dist/*/index.d.ts',
      }
    }
  }

  const newManifest = cloneDeep(manifest) as Record<string, any>
  if (Object.keys(newExports).length > 0) {
    newManifest.exports = newExports
  } else {
    delete newManifest.exports
  }

  return newManifest
}

const alignFiles = async (
  manifest: ProjectManifest,
  packagePath: string,
): Promise<ProjectManifest> => {
  const files = manifest.files ?? []
  const srcDir = path.join(packagePath, 'src')
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    if (!files.includes('dist')) {
      files.push('dist')
    }
    if (!files.includes('!dist/**/*.d.ts.map')) {
      const index = files.indexOf('dist')
      files.splice(index + 1, 0, '!dist/**/*.d.ts.map')
    }
  } else {
    pull(files, 'dist', '!dist/**/*.d.ts.map')
  }

  const newManifest = cloneDeep(manifest)
  if (files.length === 0) {
    delete newManifest.files
  } else {
    newManifest.files = files
  }

  return newManifest
}

export const makePackageJsonConfigPlugin = (): ((
  pkg: PackageMeta,
) => Promise<void>) => {
  return async (pkg) => {
    const originalManifest = cloneDeep(pkg.manifest)
    const newManifest = await alignFiles(
      await alignExports(originalManifest, pkg.path),
      pkg.path,
    )

    if (!isEqual(pkg.manifest, newManifest)) {
      const pkgJsonPath = path.join(pkg.path, 'package.json')
      await fs.promises.writeFile(
        pkgJsonPath,
        `${JSON.stringify(newManifest, null, 2)}\n`,
        'utf-8',
      )
    }
  }
}
