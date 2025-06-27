import { Command } from 'commander'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type { PackageMeta } from '../../workspace/package-meta.js'
import chalk from 'chalk'
import get from 'lodash-es/get.js'
import { loadConfig, type Configuration } from '../../repo-kit-configuration.js'
import { $ } from 'execa'
import type { SyncResult } from '../../sync/sync-result.js'
import { makeSyncRules } from '../../sync/sync-rule-factory.js'
import type { PackageFeature } from '../../sync/package-feature.js'
import { loadFeaturesConfig } from '../../sync/sync-rules-config.js'

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
        `${chalk.greenBright('[CHANGED]')} ${name}: ${chalk.yellow(result.changedFiles.join(', '))}`,
      )
      break
    case 'skipped':
      console.log(`${chalk.blue('[OK]')} ${name}`)
      break
    default:
      console.log(`${chalk.yellowBright('[UNKNOWN]')} ${name}`)
      break
  }
}

/**
 * @returns List of files which were changed, if any (relative to the package root)
 */
const applyFeatures = async (
  config: Configuration,
  pkg: PackageMeta,
  ...features: PackageFeature[]
): Promise<string[]> => {
  const changedFiles: Set<string> = new Set<string>()
  for (const feature of features) {
    const enabled = config.rules?.[feature.name] ?? true

    if (!enabled) {
      console.log(chalk.dim.gray(`[DISABLED] ${feature.name}`))
      continue
    }

    try {
      const result = await feature.configure(pkg)

      printResult(feature.name, result)

      if (result.result === 'ok') {
        result.changedFiles.forEach((file) => {
          changedFiles.add(file)
        })
      }
    } catch (t: unknown) {
      console.log(
        `${chalk.redBright('[ERROR]')} ${feature.name}: ${get(t, 'message', String(t))}`,
      )

      console.group()
      console.error(t)
      console.groupEnd()
    }
  }

  return [...changedFiles]
}

const handler = async () => {
  const config = await loadConfig()
  const featureConfig = await loadFeaturesConfig()
  const pkg = await getCurrentPackage()

  console.log(`Syncing configuration for package: ${pkg.name}...`)
  console.group()

  const changedFiles = await applyFeatures(
    config,
    pkg,
    ...makeSyncRules({
      config,
      featureConfig,
    }),
  )

  if (changedFiles.includes('package.json')) {
    console.log('Formatting package.json...')
    await $`pnpm run --if-present lint:fix:packagejson`
    console.log('Installing dependencies...')
    await $`pnpm install`
  }

  console.log('')
  console.groupEnd()
}

export const makeCommand = () =>
  new Command('sync')
    .description(
      'updates project configuration files (package.json, etc.) to align with repo-kit conventions',
    )
    .action(handler)
