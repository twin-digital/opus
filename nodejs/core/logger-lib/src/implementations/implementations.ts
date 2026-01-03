import type { Logger } from '../types.js'

/**
 * No-op function for disabled loggers
 */
const noop = (): void => {
  // Intentionally empty
}

/**
 * Console-based logger implementation
 *
 * Delegates to standard console methods. Useful for:
 * - Development and debugging
 * - Simple applications without complex logging needs
 * - Testing with console output
 */
export const consoleLogger: Logger = {
  error: (...args) => {
    console.error(...args)
  },
  warn: (...args) => {
    console.warn(...args)
  },
  info: (...args) => {
    console.info(...args)
  },
  debug: (...args) => {
    console.debug(...args)
  },
}

/**
 * No-op logger implementation
 *
 * Discards all log messages. Useful for:
 * - Testing scenarios where logs should be silenced
 * - Production code that accepts optional logger parameter
 * - Disabling logging in specific contexts
 */
export const noopLogger: Logger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
}
