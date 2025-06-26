export interface BaseSyncResult {
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

export interface SyncErrorResult extends BaseSyncResult {
  changedFiles?: undefined
  error: Error
  result: 'error'
}

export interface SyncOkResult extends BaseSyncResult {
  changedFiles: string[]
  error?: undefined
  result: 'ok'
}

export interface SyncSkippedResult extends BaseSyncResult {
  changedFiles?: undefined
  error?: undefined
  result: 'skipped'
}

/**
 * Result object containing the details of a configuration set applied to a package.
 */
export type SyncResult = SyncErrorResult | SyncOkResult | SyncSkippedResult
