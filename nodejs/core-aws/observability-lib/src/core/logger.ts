import { Logger as PowertoolsLogger } from '@aws-lambda-powertools/logger'
import type { Logger } from '@twin-digital/logger-lib'
import type { Context } from 'aws-lambda'

/**
 * Configuration options for creating a logger
 */
export interface LoggerOptions {
  /**
   * Lambda invocation context, which will be used to enrich logs if provided.
   */
  context?: Context

  /**
   * Service name for structured logging (defaults to POWERTOOLS_SERVICE_NAME env var)
   */
  serviceName?: string

  /**
   * Log level (defaults to POWERTOOLS_LOG_LEVEL env var or INFO)
   */
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

  /**
   * Whether to log event payloads (defaults to false)
   */
  logEvent?: boolean

  /**
   * Persistent log keys to include in all logs
   */
  persistentKeys?: Record<string, unknown>
}

/**
 * Extended logger with PowerTools methods for context management
 */
export interface ObservableLogger extends Logger {
  /**
   * Add context that persists across all future log calls
   */
  addContext(key: string, value: unknown): void

  /**
   * Add multiple context keys at once
   */
  appendKeys(keys: Record<string, unknown>): void

  /**
   * Remove context key
   */
  removeKeys(keys: string[]): void
}

/**
 * Create a logger instance compatible with Logger interface
 *
 * Uses AWS Lambda Powertools Logger underneath for structured logging
 * with CloudWatch Logs integration. Outputs JSON format automatically.
 *
 * @example
 * ```typescript
 * const logger = createLogger({ serviceName: 'my-service' })
 * logger.info('Processing request', { userId: '123' })
 * logger.addContext('requestId', event.requestContext.requestId)
 * ```
 */
export const createLogger = (options: LoggerOptions = {}): ObservableLogger => {
  const powertools = new PowertoolsLogger({
    serviceName: options.serviceName ?? process.env.POWERTOOLS_SERVICE_NAME ?? 'service',
    logLevel: (options.logLevel ?? process.env.POWERTOOLS_LOG_LEVEL ?? 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    persistentKeys: options.persistentKeys,
  })

  if (options.context) {
    powertools.addContext(options.context)
  }

  return {
    error: (message, ...args) => {
      if (message === undefined) {
        return
      }

      // Powertools expects a single object for structured data
      if (args.length > 0) {
        powertools.error(message, { data: args })
      } else {
        powertools.error(message)
      }
    },
    warn: (message, ...args) => {
      if (message === undefined) {
        return
      }
      if (args.length > 0) {
        powertools.warn(message, { data: args })
      } else {
        powertools.warn(message)
      }
    },
    info: (message, ...args) => {
      if (message === undefined) {
        return
      }
      if (args.length > 0) {
        powertools.info(message, { data: args })
      } else {
        powertools.info(message)
      }
    },
    debug: (message, ...args) => {
      if (message === undefined) {
        return
      }
      if (args.length > 0) {
        powertools.debug(message, { data: args })
      } else {
        powertools.debug(message)
      }
    },
    addContext: (key, value) => {
      powertools.appendKeys({ [key]: value })
    },
    appendKeys: (keys) => {
      powertools.appendKeys(keys)
    },
    removeKeys: (keys) => {
      powertools.removeKeys(keys)
    },
  }
}
