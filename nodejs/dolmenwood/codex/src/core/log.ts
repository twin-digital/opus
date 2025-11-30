import { noop } from 'lodash-es'

/**
 * Type of a function which can be used as a logger.
 */
export type LogFn = (message?: string, ...args: unknown[]) => void

export interface Logger {
  error: LogFn
  info: LogFn
}

/**
 * Logger bound to the console.
 */
export const consoleLogger: Logger = {
  error: console.error.bind(console),
  info: console.info.bind(console),
}

/**
 * Default logger that does nothing.
 */
export const noopLogger: Logger = {
  error: noop,
  info: noop,
}
