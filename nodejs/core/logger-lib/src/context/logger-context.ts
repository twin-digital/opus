import { asyncLocalStorage } from './async-local-storage.js'
import { consoleLogger } from '../implementations/implementations.js'
import type { Logger } from '../types.js'

/**
 * Cached fallback logger (console-based).
 *
 * Created lazily when getLogger() is called without a context-specific logger.
 * Used in tests, local development, and any code that runs without explicit
 * logger setup.
 */
let fallbackLogger: Logger | undefined

/**
 * Get the current logger instance.
 *
 * Returns the context-specific logger (if set via setLogger) or a console-based
 * fallback logger otherwise. Uses AsyncLocalStorage to maintain isolated logger
 * context across async operations.
 *
 * This allows code to call getLogger() anywhere and get:
 * - A configured logger with contextual information (if available in current async context)
 * - A console logger fallback (for tests, development, or unconfigured contexts)
 *
 * The logger context is automatically maintained across:
 * - Promise chains and async/await operations
 * - Callbacks executed within the async context
 * - Nested async function calls
 *
 * @returns Current logger or console-based fallback
 *
 * @example
 * ```ts
 * import { getLogger } from '@twin-digital/logger-lib'
 *
 * // Works in any context - maintains context across async operations
 * async function processData() {
 *   const logger = getLogger()
 *   logger.info('Starting process')
 *
 *   await doAsyncWork() // Logger context maintained
 *
 *   logger.info('Process complete') // Same logger instance
 * }
 * ```
 *
 * @example
 * ```ts
 * // AWS Lambda example with middleware
 * import { observabilityMiddleware } from '@twin-digital/observability-lib'
 * import middy from '@middy/core'
 *
 * const businessLogic = async () => {
 *   const logger = getLogger() // Gets Lambda logger with requestId, userId, etc.
 *   logger.info('Processing order')
 *
 *   await validateOrder() // Logger context maintained
 *   await saveOrder()     // Same logger throughout
 * }
 *
 * export const handler = middy(async (event) => {
 *   await businessLogic()
 *   return { statusCode: 200 }
 * }).use(observabilityMiddleware({ serviceName: 'order-service' }))
 * ```
 */
export const getLogger = (): Logger => {
  const currentLogger = asyncLocalStorage.getStore()

  if (currentLogger) {
    return currentLogger
  }

  // Create and cache fallback logger
  fallbackLogger ??= consoleLogger

  return fallbackLogger
}

/**
 * Set the current logger instance for the async context.
 *
 * Called by framework middleware or application setup code to provide a configured
 * logger with contextual information (requestId, userId, correlationId, etc.).
 * Uses AsyncLocalStorage to maintain isolated context for concurrent operations.
 *
 * The logger context is automatically maintained across all async operations
 * (promises, async/await, most callbacks) until cleared or the context ends.
 *
 * @param logger - Logger instance to set as current
 *
 * @example
 * ```ts
 * const logger = createLogger({ serviceName: 'my-service' })
 * setLogger(logger)
 *
 * // Logger now available in current async context
 * await processRequest() // getLogger() returns our logger
 * ```
 *
 * @example
 * ```ts
 * // AWS Lambda middleware example
 * const middleware = {
 *   before: (request) => {
 *     const logger = createLogger({ serviceName: 'my-service' })
 *     logger.appendKeys({ requestId: request.context.awsRequestId })
 *     setLogger(logger)
 *   }
 * }
 * ```
 */
export const setLogger = (logger: Logger): void => {
  asyncLocalStorage.enterWith(logger)
}

/**
 * Run a function within an isolated logger context.
 *
 * The logger context is automatically scoped to the callback - it only exists
 * within the callback's execution and is automatically cleaned up when done.
 * This is the safest pattern for logger context management.
 *
 * Use this when you want to wrap a complete operation with a specific logger.
 * For middleware patterns that need imperative control (like Middy), use
 * setLogger() instead.
 *
 * @param logger - Logger instance to use within the callback
 * @param callback - Function to execute with the logger context
 * @returns The result of the callback (preserves sync/async behavior)
 *
 * @example
 * ```ts
 * // Wrap an async operation with a specific logger
 * const result = await runWithLogger(myLogger, async () => {
 *   const logger = getLogger() // Returns myLogger
 *   await doWork()
 *   return someValue
 * })
 *
 * // After callback, context is automatically cleaned up
 * getLogger() // Returns fallback logger
 * ```
 *
 * @example
 * ```ts
 * // Testing with isolated logger contexts
 * it('should log errors', async () => {
 *   const mockLogger = { info: vi.fn(), error: vi.fn(), ... }
 *
 *   await runWithLogger(mockLogger, async () => {
 *     await myFunction() // Uses mockLogger via getLogger()
 *   })
 *
 *   expect(mockLogger.error).toHaveBeenCalled()
 * })
 * ```
 */
export const runWithLogger = <T>(logger: Logger, callback: () => T): T => {
  return asyncLocalStorage.run(logger, callback)
}
