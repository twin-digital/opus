import { Command } from 'commander'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type {
  ApplyConfigurationResult,
  ConfigPlugin,
} from '../../config-plugins/config-plugin.js'
import type { PackageMeta } from '../../workspace/package-meta.js'
import chalk from 'chalk'
import { get } from 'lodash-es'
import { makePackageJsonExportsPlugin } from '../../config-plugins/package-json-exports.js'
import { makePackageJsonFilesPlugin } from '../../config-plugins/package-json-files.js'
import { makeBootstrapEslintPlugin } from '../../config-plugins/bootstrap-eslint.js'

const printResult = (name: string, result: ApplyConfigurationResult) => {
  switch (result.result) {
    case 'error':
      console.log(
        `${chalk.redBright('[ERROR]')} ${name}: ${result.error.message}`,
      )

      console.group()
      console.log(result.error)
      console.groupEnd()
      break
    case 'ok':
      console.log(
        `${chalk.greenBright('[OK]')} ${name}: Updated ${result.changedFiles.join(', ')}`,
      )
      break
    case 'skipped':
      console.log(`${chalk.yellow('[SKIP]')} ${name}: Package up-to-date`)
      break
    default:
      console.log(`${chalk.yellowBright('[UNKNOWN]')} ${name}`)
      break
  }
}

const applyConfigPlugins = async (
  pkg: PackageMeta,
  ...plugins: ConfigPlugin[]
) => {
  for (const plugin of plugins) {
    try {
      const result = await plugin.apply({
        manifest: pkg.manifest,
        name: pkg.name,
        packagePath: pkg.path,
      })

      printResult(plugin.name, result)
    } catch (t: unknown) {
      console.log(
        `${chalk.redBright('[ERROR]')} ${plugin.name}: ${get(t, 'message', String(t))}`,
      )

      console.group()
      console.error(t)
      console.groupEnd()
    }
  }
}

const handler = async () => {
  const pkg = await getCurrentPackage()

  console.log(`Updating configuration for package: ${pkg.name}...`)
  console.group()
  await applyConfigPlugins(
    pkg,
    makePackageJsonExportsPlugin(),
    makePackageJsonFilesPlugin(),
    makeBootstrapEslintPlugin(),
  )
  console.log('')
  console.groupEnd()
}

export const makeCommand = () =>
  new Command('align-config')
    .description(
      'updates project configuration files (package.json, etc.) to align with repo-kit conventions',
    )
    .action(handler)
