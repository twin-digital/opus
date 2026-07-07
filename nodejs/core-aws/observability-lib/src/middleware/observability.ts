import type { Context } from 'aws-lambda'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware'
import { createLogger } from '../core/logger.js'
import { createMetrics } from '../core/metrics.js'
import { createTracer } from '../core/tracer.js'
import { randomUUID } from 'node:crypto'
import { setLogger } from '@twin-digital/logger-lib'
import type { ObservabilityContext } from './types.js'
import type { MiddlewareObj } from '@middy/core'

/**
 * Options for the observability middleware
 */
export interface ObservabilityMiddlewareOptions {
  /**
   * Service name for observability (defaults to POWERTOOLS_SERVICE_NAME env var)
   * Should be scoped per microservice/bounded context, not per Lambda function.
   *
   * @example 'bookify-render', 'payment-service', 'user-management'
   */
  serviceName?: string

  /**
   * Whether to log incoming events (defaults to false)
   *
   * WARNING: May log sensitive data. Only enable for debugging.
   */
  logEvent?: boolean

  /**
   * Whether to capture HTTP response in trace (defaults to true)
   */
  captureResponse?: boolean

  /**
   * Whether to skip tracing (useful for container-based functions without X-Ray daemon)
   */
  skipTracing?: boolean

  /**
   * Whether to capture cold start metric (defaults to false)
   */
  captureColdStart?: boolean
}

/**
 * Type for observability middleware return value.
 */
export type ObservabilityMiddleware<TEvent = unknown, TResult = unknown> = MiddlewareObj<
  TEvent,
  TResult,
  Error,
  ObservabilityContext
>

/**
 * Check if we're running in a native Lambda environment
 * Container-based Lambdas may not have X-Ray daemon available
 */
const isNativeLambda = (): boolean => {
  return Boolean(process.env.AWS_EXECUTION_ENV && !process.env.AWS_LAMBDA_RUNTIME_API?.includes('local'))
}

/**
 * Extract correlation ID from event headers
 */
const getCorrelationId = (event: unknown): string => {
  // Try various header formats (case-insensitive)
  if (typeof event === 'object' && event !== null && 'headers' in event) {
    const headers = (event as { headers?: Record<string, string> }).headers
    if (headers) {
      const correlationId = headers['x-correlation-id'] || headers['X-Correlation-ID'] || headers.correlationid
      if (correlationId) {
        return correlationId
      }
    }
  }
  return randomUUID()
}

/**
 * Extract request ID from event or context
 */
const getRequestId = (event: unknown, context: Context): string => {
  if (typeof event === 'object' && event !== null && 'requestContext' in event) {
    const requestContext = (event as { requestContext?: { requestId?: string } }).requestContext
    if (requestContext?.requestId) {
      return requestContext.requestId
    }
  }
  return context.awsRequestId
}

/**
 * Extract user ID from authorizer context (if available)
 */
const getUserId = (event: unknown): string | undefined => {
  if (typeof event === 'object' && event !== null && 'requestContext' in event) {
    const requestContext = (
      event as {
        requestContext?: {
          authorizer?: {
            lambda?: { userId?: string }
            userId?: string
          }
        }
      }
    ).requestContext

    return requestContext?.authorizer?.lambda?.userId ?? requestContext?.authorizer?.userId
  }
  return undefined
}

/**
 * Middy middleware that adds observability to Lambda handlers
 *
 * This middleware:
 * - Injects logger, metrics, and tracer into request.internal
 * - Adds contextual fields (requestId, userId, correlationId) to logger
 * - Delegates metric publishing to Powertools metrics middleware
 * - Adds trace annotations for correlation and user tracking
 *
 * @example
 * ```typescript
 * import middy from '@middy/core'
 * import { observabilityMiddleware } from '@twin-digital/observability-lib'
 *
 * const handler = middy(async (event, context, { internal }) => {
 *   const { logger, metrics } = internal
 *   logger.info('Processing order', { orderId: event.orderId })
 *   metrics.addMetric('OrderProcessed', MetricUnit.Count, 1)
 *   return { statusCode: 200 }
 * }).use(observabilityMiddleware({ serviceName: 'order-service' }))
 * ```
 *
 * @param options - Configuration options for observability
 * @returns Middy middleware object
 */
export const observabilityMiddleware = <TEvent = unknown, TResult = unknown>(
  options: ObservabilityMiddlewareOptions = {},
): ObservabilityMiddleware<TEvent, TResult> => {
  const metrics = createMetrics({
    namespace: process.env.POWERTOOLS_METRICS_NAMESPACE,
    serviceName: options.serviceName,
  })

  // Only create tracer if not skipped and we're in native Lambda
  const skipTracing = options.skipTracing ?? !isNativeLambda()
  const tracer =
    skipTracing ? null : (
      createTracer({
        serviceName: options.serviceName,
        captureResponse: options.captureResponse,
      })
    )

  // Compose with Powertools metrics middleware to handle metric publishing
  const metricsMiddleware = logMetrics(metrics, {
    captureColdStartMetric: options.captureColdStart ?? false,
  })

  // Compose with Powertools tracer middleware. Its `before` opens an X-Ray subsegment
  // for the invocation; we then add annotations on THAT subsegment rather than on the
  // Lambda-provided facade segment — which Powertools refuses to annotate, emitting
  // "cannot annotate the main segment in a Lambda execution environment" if we try.
  const tracerMiddleware = tracer ? captureLambdaHandler(tracer) : null

  // Per-invocation state tracking which sub-middlewares' `before` succeeded so `after`
  // / `onError` don't call cleanup on an uninitialized middleware — Powertools'
  // `captureLambdaHandler.onError` reads the subsegment stack, and calling it without
  // a paired `before` would try to close a segment that was never opened. Lambda runs
  // one invocation per container at a time, so closure-scoped booleans are safe.
  let tracerOpened = false
  let metricsStarted = false

  return {
    before: async (request) => {
      const { event, context } = request

      // Open the subsegment first so downstream annotations land on it, not on the facade.
      await tracerMiddleware?.before?.(request)
      tracerOpened = tracerMiddleware !== null

      // Create a fresh logger for this invocation with contextual information
      const requestId = getRequestId(event, context)
      const userId = getUserId(event)
      const correlationId = getCorrelationId(event)

      const logger = createLogger({
        serviceName: options.serviceName,
      })

      // Add context to logger
      logger.appendKeys({
        requestId,
        correlationId,
        ...(userId && { userId }),
      })

      // Set logger for the current async context
      // AsyncLocalStorage will automatically isolate this between concurrent invocations
      setLogger(logger)

      // Add annotations to trace — safe now because captureLambdaHandler.before ran first
      // and the current segment is a subsegment (not the Lambda facade).
      if (tracer) {
        tracer.putAnnotation('correlationId', correlationId)
        if (userId) {
          tracer.putAnnotation('userId', userId)
        }
      }

      // Inject logger, metrics, and tracer into Lambda context
      // These will be accessible to the handler as context.logger, context.metrics, context.tracer
      context.logger = logger
      context.metrics = metrics
      context.tracer = tracer

      // Delegate to Powertools metrics middleware for metric handling
      await metricsMiddleware.before?.(request)
      metricsStarted = true
    },

    after: async (request) => {
      // try/finally so a metrics flush failure doesn't leak the X-Ray subsegment into
      // the warm container's next invocation — `captureLambdaHandler.after` must run.
      try {
        if (metricsStarted) {
          await metricsMiddleware.after?.(request)
        }
      } finally {
        if (tracerOpened) {
          await tracerMiddleware?.after?.(request)
        }
        tracerOpened = false
        metricsStarted = false
      }
    },

    onError: async (request) => {
      // Same try/finally shape as `after` — a metrics-flush throw on the error path
      // is the exact scenario where losing the subsegment close matters most (a warm
      // container ends up with an unclosed segment across every subsequent invocation).
      try {
        if (metricsStarted) {
          await metricsMiddleware.onError?.(request)
        }
      } finally {
        if (tracerOpened) {
          await tracerMiddleware?.onError?.(request)
        }
        tracerOpened = false
        metricsStarted = false
      }
    },
  }
}
