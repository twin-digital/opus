import type { Context as LambdaContext } from 'aws-lambda'
import type { ObservabilityContext } from '@twin-digital/observability-lib'
import { vi } from 'vitest'

/**
 * Options for creating a mock Lambda context
 */
export interface MockLambdaContextOptions {
  /** Function name (default: 'test-function') */
  functionName?: string
  /** Function version (default: '1') */
  functionVersion?: string
  /** AWS request ID (default: 'test-aws-request-id') */
  awsRequestId?: string
  /** Memory limit in MB (default: '128') */
  memoryLimitInMB?: string
  /** Remaining time in ms (default: 30000) */
  remainingTimeMs?: number
  /** Log group name */
  logGroupName?: string
  /** Log stream name */
  logStreamName?: string
}

/**
 * Create a mock AWS Lambda Context object for testing.
 *
 * @example
 * ```typescript
 * const context = createMockLambdaContext()
 *
 * const result = await handler(event, context)
 * ```
 *
 * @example
 * ```typescript
 * const context = createMockLambdaContext({
 *   functionName: 'my-function',
 *   awsRequestId: 'custom-request-id',
 *   remainingTimeMs: 5000,
 * })
 * ```
 */
export function createMockLambdaContext(options: MockLambdaContextOptions = {}): LambdaContext {
  const {
    functionName = 'test-function',
    functionVersion = '1',
    awsRequestId = 'test-aws-request-id',
    memoryLimitInMB = '128',
    remainingTimeMs = 30000,
    logGroupName = `/aws/lambda/${functionName}`,
    logStreamName = '2024/01/01/[$LATEST]test',
  } = options

  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName,
    functionVersion,
    invokedFunctionArn: `arn:aws:lambda:us-east-1:123456789012:function:${functionName}`,
    memoryLimitInMB,
    awsRequestId,
    logGroupName,
    logStreamName,
    getRemainingTimeInMillis: () => remainingTimeMs,
    done: () => undefined,
    fail: () => undefined,
    succeed: () => undefined,
  }
}

/**
 * Mock logger object for testing. All methods are vitest mock functions.
 * Uses `any` to ensure compatibility with the real Logger interface.
 */
export interface MockLogger {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  debug: any
  info: any
  warn: any
  error: any
  addContext: any
  appendKeys: any
  removeKeys: any
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Mock metrics object for testing. All methods are vitest mock functions.
 * Uses `any` to ensure compatibility with the real Metrics interface.
 */
export interface MockMetrics {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  addMetric: any
  addDimension: any
  addMetadata: any
  publishStoredMetrics: any
  setDefaultDimensions: any
  clearDefaultDimensions: any
  clearMetadata: any
  clearMetrics: any
  serializeMetrics: any
  singleMetric: any
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Create a mock logger object for testing.
 *
 * All methods are vitest mock functions that can be inspected.
 *
 * @example
 * ```typescript
 * const logger = createMockLogger()
 * myFunction(logger)
 * expect(logger.info).toHaveBeenCalledWith('Processing', { id: 123 })
 * ```
 */
export function createMockLogger(): MockLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    addContext: vi.fn(),
    appendKeys: vi.fn(),
    removeKeys: vi.fn(),
  }
}

/**
 * Create a mock metrics object for testing.
 *
 * All methods are vitest mock functions that can be inspected.
 *
 * @example
 * ```typescript
 * const metrics = createMockMetrics()
 * myFunction(metrics)
 * expect(metrics.addMetric).toHaveBeenCalledWith('OrderProcessed', 'Count', 1)
 * ```
 */
export function createMockMetrics(): MockMetrics {
  return {
    addMetric: vi.fn(),
    addDimension: vi.fn(),
    addMetadata: vi.fn(),
    publishStoredMetrics: vi.fn(),
    setDefaultDimensions: vi.fn(),
    clearDefaultDimensions: vi.fn(),
    clearMetadata: vi.fn(),
    clearMetrics: vi.fn(),
    serializeMetrics: vi.fn(() => '{}'),
    singleMetric: vi.fn(),
  }
}

/**
 * Observability context containing mock logger, metrics, and tracer.
 * Extends the mock Lambda context with observability properties.
 * Internal type that gets cast to the real ObservabilityContext.
 */
interface MockObservabilityContextInternal extends LambdaContext {
  logger: MockLogger
  metrics: MockMetrics
  tracer: null
}

/**
 * Create a mock observability context for testing handlers that use `withObservability`.
 *
 * This creates a full context object with mock logger and metrics that can be
 * passed to raw handler functions for unit testing.
 *
 * Returns `ObservabilityContext` so it's directly usable with handlers.
 * The mock methods (logger.info, metrics.addMetric, etc.) are vitest mock functions
 * that you can use with `expect(...).toHaveBeenCalled()`.
 *
 * @example
 * ```typescript
 * const context = createMockObservabilityContext()
 * const result = await rawHandler(event, context)
 *
 * expect(context.logger.info).toHaveBeenCalledWith('Request processed')
 * expect(context.metrics.addMetric).toHaveBeenCalledWith('RequestCount', 'Count', 1)
 * ```
 */
export function createMockObservabilityContext(options: MockLambdaContextOptions = {}): ObservabilityContext {
  const mockContext: MockObservabilityContextInternal = {
    ...createMockLambdaContext(options),
    logger: createMockLogger(),
    metrics: createMockMetrics(),
    tracer: null,
  }
  // Cast to ObservabilityContext - the mock functions satisfy the interface at runtime
  return mockContext as unknown as ObservabilityContext
}
