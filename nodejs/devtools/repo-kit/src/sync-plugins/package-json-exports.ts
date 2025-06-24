import fs from 'fs'
import path from 'path'
import type { PackageManifest } from '@pnpm/types'
import { makeSyncPlugin, transformJson } from './make-config-plugin.js'
import type { SyncPlugin } from './sync-plugin.js'
import type { Configuration } from '../repo-kit-configuration.js'

export type ProjectManifestWithCorrectedExports = Omit<
  PackageManifest,
  'exports'
> & { exports?: Record<string, string | Record<string, string>> }

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

/**
 * Creates a `SyncPlugin` which updates the exports in a package's package.json file to include all barrel files
 * in the source root, or one level deep.
 */
export const makePackageJsonExportsPlugin = (
  _configuration: Configuration,
): SyncPlugin =>
  makeSyncPlugin('package-exports', {
    'package.json': transformJson((content, { packagePath }) => {
      const newExports: Record<string, string | Record<string, string>> = {}
      const manifest = (content ?? {}) as ProjectManifestWithCorrectedExports

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

      if (Object.keys(newExports).length > 0) {
        manifest.exports = newExports
      } else {
        delete manifest.exports
      }

      return manifest
    }),
  })
