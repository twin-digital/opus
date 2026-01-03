import middy from '@middy/core'
import { observabilityMiddleware, type ObservabilityMiddlewareOptions } from './observability.js'
import type { ObservabilityHandler } from './types.js'

/**
 * Wrap a Lambda handler with observability middleware
 *
 * This convenience function applies observability middleware to your handler,
 * providing structured logging, metrics, and tracing. The logger and metrics
 * instances are injected into the handler via the third parameter.
 *
 * **Best Practice**: Don't log Lambda invocation start/end - AWS already tracks this.
 * Only log business events, errors, and important state changes.
 *
 * @example
 * ```typescript
 * import { withObservability } from '@twin-digital/observability-lib'
 * import { MetricUnit } from '@aws-lambda-powertools/metrics'
 *
 * export const handler = withObservability(
 *   async (event, context) => {
 *     const { logger, metrics } = context
 *
 *     logger.info('Processing order', { orderId: event.orderId })
 *     metrics.addMetric('OrderProcessed', MetricUnit.Count, 1)
 *
 *     return { statusCode: 200, body: 'OK' }
 *   },
 *   { serviceName: 'order-service' }
 * )
 * ```
 *
 * @param handler - Your Lambda handler function
 * @param options - Observability configuration options
 * @returns Middyfied handler with observability
 */
export const withObservability = <TEvent = unknown, TResult = unknown>(
  handler: ObservabilityHandler<TEvent, TResult>,
  options?: ObservabilityMiddlewareOptions,
): middy.MiddyfiedHandler<TEvent, TResult> => {
  const middleware = observabilityMiddleware(options)
  // The handler works with ObservabilityContext, but the return type is the standard MiddyfiedHandler
  // This is safe because ObservabilityContext extends Context
  return middy(handler).use(middleware) as unknown as middy.MiddyfiedHandler<TEvent, TResult>
}
