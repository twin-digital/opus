import { Command } from 'commander'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type { SyncResult, SyncPlugin } from '../../sync-plugins/sync-plugin.js'
import type { PackageMeta } from '../../workspace/package-meta.js'
import chalk from 'chalk'
import compact from 'lodash-es/compact.js'
import get from 'lodash-es/get.js'
import { makePackageJsonExportsPlugin } from '../../sync-plugins/package-json-exports.js'
import { makePackageJsonFilesPlugin } from '../../sync-plugins/package-json-files.js'
import { makeBootstrapEslintPlugin } from '../../sync-plugins/bootstrap-eslint.js'
import { loadConfig } from '../../repo-kit-configuration.js'
import { $ } from 'execa'

const printResult = (name: string, result: SyncResult) => {
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

const applySyncPlugins = async (pkg: PackageMeta, ...plugins: SyncPlugin[]) => {
  let installNeeded = false
  for (const plugin of plugins) {
    try {
      const result = await plugin.sync({
        manifest: pkg.manifest,
        name: pkg.name,
        packagePath: pkg.path,
      })

      printResult(plugin.name, result)

      if (
        result.changedFiles &&
        result.changedFiles.length > 0 &&
        plugin.requiresDependencyInstall
      ) {
        installNeeded = true
      }
    } catch (t: unknown) {
      console.log(
        `${chalk.redBright('[ERROR]')} ${plugin.name}: ${get(t, 'message', String(t))}`,
      )

      console.group()
      console.error(t)
      console.groupEnd()
    }
  }

  if (installNeeded) {
    console.log('Installing new dependencies...')
    await $`pnpm install`
  }
}

const handler = async () => {
  const config = await loadConfig()
  const pkg = await getCurrentPackage()

  console.log(`Syncing configuration for package: ${pkg.name}...`)
  console.group()
  await applySyncPlugins(
    pkg,
    ...compact([
      makePackageJsonExportsPlugin(config),
      makePackageJsonFilesPlugin(config),
      makeBootstrapEslintPlugin(config),
    ]),
  )
  console.log('')
  console.groupEnd()
}

export const makeCommand = () =>
  new Command('sync')
    .description(
      'updates project configuration files (package.json, etc.) to align with repo-kit conventions',
    )
    .action(handler)
