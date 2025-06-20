import { Command } from 'commander'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type { PackageMeta } from '../../workspace/package-meta.js'
import { makePackageJsonConfigPlugin } from '../../config-plugins/package-json.js'

const handler = async () => {
  const pkg = await getCurrentPackage()
  await makePackageJsonConfigPlugin()(pkg)
}

export const makeCommand = () =>
  new Command('align-config')
    .description(
      'updates project configuration files (package.json, etc.) to align with repo-kit conventions',
    )
    .action(handler)
