import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics'

/**
 * Configuration options for creating metrics
 */
export interface MetricsOptions {
  /**
   * CloudWatch namespace for metrics (defaults to POWERTOOLS_METRICS_NAMESPACE env var)
   */
  namespace?: string

  /**
   * Service name dimension (defaults to POWERTOOLS_SERVICE_NAME env var)
   */
  serviceName?: string

  /**
   * Default dimensions to add to all metrics
   */
  defaultDimensions?: Record<string, string>
}

/**
 * Create a metrics instance for recording custom business metrics
 *
 * Uses AWS Lambda Powertools Metrics with EMF (Embedded Metric Format)
 * which writes metrics to CloudWatch Logs. CloudWatch automatically extracts
 * and creates metrics without API calls.
 *
 * @example
 * ```typescript
 * const metrics = createMetrics({ namespace: 'Bookify/API' })
 * metrics.addMetric('RequestCount', MetricUnit.Count, 1)
 * metrics.addDimension('Operation', 'RenderHTML')
 * await metrics.publishStoredMetrics() // Call in middleware after handler
 * ```
 */
export const createMetrics = (options: MetricsOptions = {}): Metrics => {
  return new Metrics({
    namespace: options.namespace ?? process.env.POWERTOOLS_METRICS_NAMESPACE ?? 'Application',
    serviceName: options.serviceName ?? process.env.POWERTOOLS_SERVICE_NAME ?? 'service',
    defaultDimensions: options.defaultDimensions,
  })
}

// Re-export MetricUnit for convenience
export { MetricUnit }
