import { Tracer } from '@aws-lambda-powertools/tracer'

/**
 * Configuration options for creating a tracer
 */
export interface TracerOptions {
  /**
   * Service name for tracing (defaults to POWERTOOLS_SERVICE_NAME env var)
   */
  serviceName?: string

  /**
   * Whether tracing is enabled (defaults to POWERTOOLS_TRACER_ENABLED env var or true)
   */
  enabled?: boolean

  /**
   * Whether to capture Lambda handler response in trace (defaults to true)
   */
  captureResponse?: boolean

  /**
   * Whether to capture Lambda handler error in trace (defaults to true)
   */
  captureError?: boolean
}

/**
 * Create a tracer instance for AWS X-Ray distributed tracing
 *
 * Uses AWS Lambda Powertools Tracer which integrates with AWS X-Ray.
 * Sampling rate is configured via AWS_XRAY_TRACING_SAMPLING_RATE env var (default 10%).
 *
 * Note: X-Ray daemon must be available (automatically provided in native Lambda,
 * but container-based functions may need sidecar).
 *
 * @example
 * ```typescript
 * const tracer = createTracer({ serviceName: 'my-service' })
 * tracer.addAnnotation('userId', userId)
 * tracer.addMetadata('requestDetails', { /* data * / })
 * ```
 */
export const createTracer = (options: TracerOptions = {}): Tracer => {
  return new Tracer({
    serviceName: options.serviceName ?? process.env.POWERTOOLS_SERVICE_NAME ?? 'service',
    enabled: options.enabled ?? process.env.POWERTOOLS_TRACER_ENABLED !== 'false',
  })
}
