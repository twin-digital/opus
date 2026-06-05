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
import { getWorkspaceRoot } from '../../workspace/get-workspace-root.js'
import fsP from 'node:fs/promises'

const printResult = (name: string, result: SyncResult) => {
  switch (result.result) {
    case 'error':
      console.log(`${chalk.redBright('[ERROR]')} ${name}: ${result.error.message}`)

      console.group()
      console.log(result.error)
      console.groupEnd()
      break
    case 'ok':
      console.log(`${chalk.greenBright('[CHANGED]')} ${name}: ${chalk.yellow(result.changedFiles.join(', '))}`)
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
 * Applies every enabled feature to a package. Individual failures are logged and tallied but do not abort the run, so
 * one failing feature (or package) does not prevent the rest of the sync sweep — the caller is responsible for turning
 * a non-zero tally into a non-zero exit code.
 *
 * @returns The files which were changed (relative to the package root) and the number of features that failed (whether
 * by throwing or by returning an `error` result).
 */
export const applyFeatures = async (
  config: PackageConfiguration,
  pkg: PackageMeta,
  ...features: PackageFeature[]
): Promise<{ changedFiles: string[]; errorCount: number }> => {
  const changedFiles: Set<string> = new Set<string>()
  let errorCount = 0
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
      } else if (result.result === 'error') {
        errorCount++
      }
    } catch (t: unknown) {
      console.log(`${chalk.redBright('[ERROR]')} ${feature.name}: ${get(t, 'message', String(t))}`)

      console.group()
      console.error(t)
      console.groupEnd()
      errorCount++
    }
  }

  return { changedFiles: [...changedFiles], errorCount }
}

/**
 * Applies a single hook if any changed files match its pattern.
 *
 * @param hook The hook configuration to apply
 * @param pkg Package metadata containing the working directory
 * @param changedFiles Array of files that were changed during sync (relative to package root)
 * @throws Error if the hook command fails
 */
const applyHookIfNeeded = async (hook: HookConfig, pkg: PackageMeta, changedFiles: string[]): Promise<void> => {
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
const applyHooks = async (pkg: PackageMeta, config: Configuration, changedFiles: string[]): Promise<void> => {
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
      console.log(`${chalk.redBright('[ERROR]')} Hook failed: ${hookLabel}: ${errorMessage}`)
      errors.push({ hook: hookLabel, error })
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map(({ hook }) => `  - ${hook}`).join('\n')
    throw new Error(`${errors.length} hook(s) failed:\n${errorMessages}`)
  }
}

/**
 * Syncs a single package's configuration.
 *
 * @returns The number of features that failed for this package.
 */
const syncOnePackage = async (pkg: PackageMeta, config: Configuration, isRoot: boolean): Promise<number> => {
  console.log(`Syncing configuration for package: ${pkg.name}...`)
  console.group()

  const packageConfig = config.packages[pkg.name] ?? {}

  const { changedFiles, errorCount } = await applyFeatures(
    packageConfig,
    pkg,
    ...makeSyncRules({
      config: packageConfig,
      featureConfig: config,
      project: { isRoot },
    }),
  )

  await applyHooks(pkg, config, changedFiles)

  console.log('')
  console.groupEnd()

  return errorCount
}

const handler = async (options: { config: string }) => {
  const config = await loadConfig(options.config)
  const rootPath = await getWorkspaceRoot()
  const packages = await findPackages({ includeRoot: true })

  let errorCount = 0
  for (const pkg of packages) {
    errorCount += await syncOnePackage(pkg, config, pkg.path === rootPath)
  }

  // A failed feature is logged inline but must also fail the run, otherwise the merge-checks gate (which sees only a
  // clean exit) would treat a broken sync as success. Failures are aggregated across all packages so the sweep still
  // attempts every package before exiting non-zero.
  if (errorCount > 0) {
    console.log(
      chalk.redBright(`[FAILED] ${errorCount.toString()} feature(s) failed during sync; see [ERROR] output above.`),
    )
    process.exitCode = 1
  }
}

export const makeCommand = (): Command =>
  new Command('sync')
    .description('updates project configuration files (package.json, etc.) to align with repo-kit conventions')
    .option('--config <path>', 'path to repo-kit configuration file', '.repo-kit.yml')
    .action(handler)
