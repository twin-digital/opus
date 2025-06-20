import fs from 'fs'
import path from 'path'
import { Command } from 'commander'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isEqual from 'lodash-es/isEqual.js'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

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

const alignPackageConfig = async (pkg: PackageMeta): Promise<void> => {
  const newExports: Record<string, any> = {}

  const srcDir = path.join(pkg.path, 'src')
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

  const newManifest = cloneDeep(pkg.manifest) as Record<string, any>
  if (Object.keys(newExports).length > 0) {
    newManifest.exports = newExports
  } else {
    delete newManifest.exports
  }

  newManifest.files = ['dist', '!*.d.ts.map']

  if (!isEqual(pkg.manifest, newManifest)) {
    const pkgJsonPath = path.join(pkg.path, 'package.json')
    await fs.promises.writeFile(
      pkgJsonPath,
      JSON.stringify(newManifest, null, 2),
      'utf-8',
    )
  }
}

const handler = async () => {
  const pkg = await getCurrentPackage()
  await alignPackageConfig(pkg)
}

export const makeCommand = () =>
  new Command('align-config')
    .description(
      'updates project configuration files (package.json, etc.) to align with repo-kit conventions',
    )
    .action(handler)
