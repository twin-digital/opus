import { Command } from 'commander'
import { getCurrentPackage } from '../../workspace/get-current-package.js'
import type { PackageMeta } from '../../workspace/package-meta.js'
import chalk from 'chalk'
import compact from 'lodash-es/compact.js'
import get from 'lodash-es/get.js'
import { makeEslintBootstrapPlugin } from '../../sync/legacy-plugins/eslint-config-bootstrap.js'
import { loadConfig, type Configuration } from '../../repo-kit-configuration.js'
import { $ } from 'execa'
import type { SyncResult } from '../../sync/sync-result.js'
import { loadSyncRulesConfig } from '../../sync/sync-rules-config.js'
import type { SyncRule } from '../../sync/sync-rule.js'
import { makeSyncRules } from '../../sync/sync-rule-factory.js'
import { asSyncRule } from '../../sync/legacy-make-config-plugin.js'

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
const applySyncRules = async (
  config: Configuration,
  pkg: PackageMeta,
  ...rules: SyncRule[]
): Promise<string[]> => {
  const changedFiles: Set<string> = new Set<string>()
  for (const rule of rules) {
    const enabled = config.rules?.[rule.name] ?? true

    if (!enabled) {
      console.log(chalk.dim.gray(`[DISABLED] ${rule.name}`))
      continue
    }

    try {
      const result = await rule.apply(pkg)

      printResult(rule.name, result)

      if (result.result === 'ok') {
        result.changedFiles.forEach((file) => {
          changedFiles.add(file)
        })
      }
    } catch (t: unknown) {
      console.log(
        `${chalk.redBright('[ERROR]')} ${rule.name}: ${get(t, 'message', String(t))}`,
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
  const syncRulesConfig = await loadSyncRulesConfig()
  const pkg = await getCurrentPackage()

  console.log(`Syncing configuration for package: ${pkg.name}...`)
  console.group()

  const changedFiles = await applySyncRules(
    config,
    pkg,
    ...compact([makeEslintBootstrapPlugin()]).map(asSyncRule),
    ...makeSyncRules({
      config,
      rules: syncRulesConfig,
    }),
  )

  if (changedFiles.includes('package.json')) {
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

// more things:
//   - tsconfig stuff (configs, scripts, etc)
//   - 'init' to bootstrap a whole new package
