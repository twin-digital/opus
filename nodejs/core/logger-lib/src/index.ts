/**
 * @twin-digital/logger-lib
 *
 * Generic logging interface and implementations for TypeScript applications.
 * Provides a common Logger interface that can be implemented by various
 * logging libraries (console, Powertools, Pino, Winston, etc.)
 */

export type { Logger, LogFn } from './types.js'
export { consoleLogger, noopLogger } from './implementations/implementations.js'
export { getLogger, setLogger, runWithLogger } from './context/logger-context.js'
