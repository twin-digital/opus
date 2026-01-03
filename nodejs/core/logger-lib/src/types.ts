/**
 * Log function signature
 */
export type LogFn = (message?: string, ...args: unknown[]) => void

/**
 * Generic logger interface
 *
 * Compatible with console and most logging libraries.
 * Implementations should support structured logging where applicable.
 */
export interface Logger {
  /**
   * Log error-level message
   */
  error: LogFn

  /**
   * Log warning-level message
   */
  warn: LogFn

  /**
   * Log info-level message
   */
  info: LogFn

  /**
   * Log debug-level message
   */
  debug: LogFn
}
