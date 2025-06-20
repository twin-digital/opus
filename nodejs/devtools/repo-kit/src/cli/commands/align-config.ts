import fs from 'fs'
import path from 'path'
import { Command } from 'commander'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isEqual from 'lodash-es/isEqual.js'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

const alignPackageConfig = async (pkg: PackageMeta): Promise<void> => {
  const newManifest = cloneDeep(pkg.manifest) as Record<string, any>
  newManifest.exports = {
    '.': {
      import: './dist/index.js',
      types: './dist/index.d.ts',
    },
    './*': {
      import: './dist/*/index.js',
      types: './dist/*/index.d.ts',
    },
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
