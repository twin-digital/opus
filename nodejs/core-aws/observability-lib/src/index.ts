/**
 * @twin-digital/observability-lib
 *
 * AWS Lambda observability utilities with Powertools integration.
 * Provides structured logging, metrics, and distributed tracing.
 *
 * @example
 * ```typescript
 * import { withObservability, MetricUnit } from '@twin-digital/observability-lib'
 *
 * export const handler = withObservability(
 *   async (event, context, { internal }) => {
 *     const { logger, metrics } = internal
 *     logger.info('Processing request', { userId: event.userId })
 *     metrics.addMetric('ProcessedRequests', MetricUnit.Count, 1)
 *     return { statusCode: 200 }
 *   },
 *   { serviceName: 'my-service' }
 * )
 * ```
 */

// Core utilities
export * from './core/logger.js'
export * from './core/metrics.js'
export * from './core/tracer.js'

// Middleware
export * from './middleware/observability.js'
export * from './middleware/with-observability.js'
export * from './middleware/types.js'

// Re-export Logger interface and context functions for convenience
export type { Logger } from '@twin-digital/logger-lib'
export { getLogger, setLogger, runWithLogger } from '@twin-digital/logger-lib'

// Re-export power tools types for convenience
export type { Metrics } from '@aws-lambda-powertools/metrics'
export type { Tracer } from '@aws-lambda-powertools/tracer'
