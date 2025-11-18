import { Command } from 'commander'
import type { PackageMeta } from '../../workspace/package-meta.js'
import chalk from 'chalk'
import get from 'lodash-es/get.js'
import intersection from 'lodash-es/intersection.js'
import {
  loadConfig,
  type Configuration,
  type HookConfig,
  type PackageConfiguration,
} from '../../config/repo-kit-configuration.js'
import { $ } from 'execa'
import type { SyncResult } from '../../sync/sync-result.js'
import { makeSyncRules } from '../../sync/sync-rule-factory.js'
import type { PackageFeature } from '../../sync/package-feature.js'
import { findPackages } from '../../workspace/find-packages.js'
import fsP from 'node:fs/promises'

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
  config: PackageConfiguration,
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

/**
 * Applies a single hook if any changed files match its pattern.
 *
 * @param hook The hook configuration to apply
 * @param pkg Package metadata containing the working directory
 * @param changedFiles Array of files that were changed during sync (relative to package root)
 * @throws Error if the hook command fails
 */
const applyHookIfNeeded = async (
  hook: HookConfig,
  pkg: PackageMeta,
  changedFiles: string[],
): Promise<void> => {
  // Find files matching the hook's pattern and check if any changed files match
  const matchingFiles: string[] = []
  for await (const file of fsP.glob(hook.path, { cwd: pkg.path })) {
    matchingFiles.push(file)
  }

  // Check if any changed files intersect with matching files
  if (intersection(changedFiles, matchingFiles).length === 0) {
    return
  }

  const hookLabel = hook.description ?? hook.run
  console.log(`${chalk.cyan('[HOOK]')} ${hookLabel}`)

  await $({ cwd: pkg.path, stdio: 'inherit', shell: true })`${hook.run}`
}

/**
 * Applies hooks from configuration if any changed files match their patterns.
 * Hooks are executed in the order they are defined. If any hooks fail, an error is thrown
 * after attempting to run all applicable hooks.
 *
 * @param pkg Package metadata
 * @param config Repository configuration containing hooks
 * @param changedFiles Array of files that were changed during sync (relative to package root)
 * @throws Error if any hooks fail during execution
 */
const applyHooks = async (
  pkg: PackageMeta,
  config: Configuration,
  changedFiles: string[],
): Promise<void> => {
  const hooks = config.hooks ?? []
  if (hooks.length === 0 || changedFiles.length === 0) {
    return
  }

  const errors: { hook: string; error: unknown }[] = []

  for (const hook of hooks) {
    try {
      await applyHookIfNeeded(hook, pkg, changedFiles)
    } catch (error: unknown) {
      const hookLabel = hook.description ?? hook.run
      const errorMessage = get(error, 'message', String(error))
      console.log(
        `${chalk.redBright('[ERROR]')} Hook failed: ${hookLabel}: ${errorMessage}`,
      )
      errors.push({ hook: hookLabel, error })
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map(({ hook }) => `  - ${hook}`).join('\n')
    throw new Error(`${errors.length} hook(s) failed:\n${errorMessages}`)
  }
}

const syncOnePackage = async (pkg: PackageMeta, config: Configuration) => {
  console.log(`Syncing configuration for package: ${pkg.name}...`)
  console.group()

  const packageConfig = config.packages[pkg.name] ?? {}

  const changedFiles = await applyFeatures(
    packageConfig,
    pkg,
    ...makeSyncRules({
      config: packageConfig,
      featureConfig: config,
    }),
  )

  await applyHooks(pkg, config, changedFiles)

  console.log('')
  console.groupEnd()
}

const handler = async (options: { config: string }) => {
  const config = await loadConfig(options.config)
  const packages = await findPackages()
  for (const pkg of packages) {
    await syncOnePackage(pkg, config)
  }
}

export const makeCommand = (): Command =>
  new Command('sync')
    .description(
      'updates project configuration files (package.json, etc.) to align with repo-kit conventions',
    )
    .option(
      '--config <path>',
      'path to repo-kit configuration file',
      '.repo-kit.yml',
    )
    .action(handler)
