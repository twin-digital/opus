import type { Command } from '@oclif/core'
import type { Logger } from '@twin-digital/logger-lib'

/**
 * Creates a Logger adapter that bridges oclif Command logging methods
 * to the generic Logger interface from @twin-digital/logger-lib.
 *
 * @param command - The oclif Command instance to wrap
 * @returns A Logger implementation that delegates to oclif Command methods
 *
 * @remarks
 * This adapter allows oclif commands to use logger-aware code without
 * tight coupling to oclif-specific APIs. It maps:
 * - `error` → `command.logToStderr()` (writes to stderr, never exits)
 * - `warn` → `command.warn()` (writes to stderr, never exits)
 * - `info` → `command.log()` (writes to stdout)
 * - `debug` → `command.logToStderr()` (writes to stderr)
 *
 * @example
 * ```typescript
 * import { Command } from '@oclif/core'
 * import { makeOclifLogger } from '@twin-digital/cli-lib'
 * import { setLogger } from '@twin-digital/logger-lib'
 *
 * export default class MyCommand extends Command {
 *   async run() {
 *     const logger = makeOclifLogger(this)
 *     setLogger(logger)
 *
 *     // Now use logger-aware functions
 *     await processSomething() // Uses getLogger() internally
 *   }
 * }
 * ```
 *
 * @see {@link https://oclif.io/docs/base_class oclif Command documentation}
 */
export function makeOclifLogger(command: Command): Logger {
  return {
    error(message?: string, ...args: unknown[]): void {
      if (message === undefined) {
        return
      }
      // Use logToStderr to ensure we never exit the process
      command.logToStderr(message, args)
    },
    warn(message?: string, ...args: unknown[]): void {
      if (message === undefined) {
        return
      }
      command.logToStderr(message, args)
    },
    info(message?: string, ...args: unknown[]): void {
      if (message === undefined) {
        return
      }
      command.log(message, args)
    },
    debug(message?: string, ...args: unknown[]): void {
      if (message === undefined) {
        return
      }
      // oclif doesn't have a debug method, use logToStderr for debug output
      command.logToStderr(message, args)
    },
  }
}
