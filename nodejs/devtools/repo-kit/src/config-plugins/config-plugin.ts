import type { ProjectManifest } from '@pnpm/types'

export interface BaseApplyConfigurationResult {
  /**
   * Array of files which were changed, relative to the root of the package. Will be undefined of the `result` is not
   * 'ok'.
   */
  changedFiles?: string[]

  /**
   * Error which caused an "error" result. Will be undefined if the result is "ok" or "skipped".
   */
  error?: Error

  /**
   * Result of the configuration task:
   *
   * - error: the configuration failed to apply
   * - ok: the configuration for the package was successfully updated
   * - skipped: there were no configuration changes needed
   */
  result: 'error' | 'ok' | 'skipped'
}

export interface ErrorApplyConfigurationResult
  extends BaseApplyConfigurationResult {
  changedFiles?: undefined
  error: Error
  result: 'error'
}

export interface OkApplyConfigurationResult
  extends BaseApplyConfigurationResult {
  changedFiles: string[]
  error?: undefined
  result: 'ok'
}

export interface SkippedApplyConfigurationResult
  extends BaseApplyConfigurationResult {
  changedFiles?: undefined
  error?: undefined
  result: 'skipped'
}

/**
 * Result object containing the details of a configuration set applied to a package.
 */
export type ApplyConfigurationResult =
  | ErrorApplyConfigurationResult
  | OkApplyConfigurationResult
  | SkippedApplyConfigurationResult

export interface ConfigPlugin {
  /**
   * Name of the plugin
   */
  name: string

  /**
   * Applies the configuration from this plugin to a package in the monorepo.
   * @param params
   */
  apply(input: {
    /**
     * Manifest of the project to configure
     */
    manifest: ProjectManifest

    /**
     * Name of the package to configure
     */
    name: string

    /**
     * Path to the root of the package to configure
     */
    packagePath: string
  }): ApplyConfigurationResult | Promise<ApplyConfigurationResult>
}

export type ApplyConfigInput = Parameters<ConfigPlugin['apply']>[0]
