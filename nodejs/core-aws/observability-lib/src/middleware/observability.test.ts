import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Context } from 'aws-lambda'
import { observabilityMiddleware } from './observability.js'
import { setLogger } from '@twin-digital/logger-lib'
import { createLogger } from '../core/logger.js'
import { createTracer } from '../core/tracer.js'
import type { ObservabilityContext } from './types.js'

// Mock modules before importing
vi.mock('../core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    addContext: vi.fn(),
    appendKeys: vi.fn(),
    removeKeys: vi.fn(),
  })),
}))

vi.mock('../core/metrics.js', () => ({
  createMetrics: vi.fn(() => ({
    addMetric: vi.fn(),
    addDimension: vi.fn(),
    publishStoredMetrics: vi.fn(),
    captureColdStartMetric: vi.fn(),
  })),
}))

vi.mock('../core/tracer.js', () => ({
  createTracer: vi.fn(() => ({
    putAnnotation: vi.fn(),
    putMetadata: vi.fn(),
  })),
}))

vi.mock('@aws-lambda-powertools/metrics/middleware', () => ({
  logMetrics: vi.fn(() => ({
    before: vi.fn(),
    after: vi.fn(),
    onError: vi.fn(),
  })),
}))

vi.mock('@aws-lambda-powertools/tracer/middleware', () => ({
  captureLambdaHandler: vi.fn(() => ({
    before: vi.fn(),
    after: vi.fn(),
    onError: vi.fn(),
  })),
}))

vi.mock('@twin-digital/logger-lib', () => ({
  setLogger: vi.fn(),
}))

describe('observabilityMiddleware', () => {
  const mockContext: Context = {
    awsRequestId: 'test-aws-request-id',
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:test',
    memoryLimitInMB: '128',
    logGroupName: '/aws/lambda/test',
    logStreamName: 'test-stream',
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => 30000,
    done: vi.fn(),
    fail: vi.fn(),
    succeed: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x'
  })

  afterEach(() => {
    delete process.env.AWS_EXECUTION_ENV
  })

  describe('middleware creation', () => {
    it('creates middleware with default options', () => {
      const middleware = observabilityMiddleware()

      expect(middleware).toBeDefined()
    })

    it('creates middleware with custom service name', async () => {
      const middleware = observabilityMiddleware({ serviceName: 'my-service' })
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      await middleware.before?.(request)

      // Verify createLogger was called with the custom service name in the before hook
      expect(createLogger).toHaveBeenCalledWith({
        serviceName: 'my-service',
      })
    })
  })

  describe('before hook', () => {
    it('injects logger, metrics, and tracer into context', async () => {
      const middleware = observabilityMiddleware()
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      await middleware.before?.(request)

      expect(request.context.logger).toBeDefined()
      expect(request.context.metrics).toBeDefined()
      expect(request.context.tracer).toBeDefined()
    })

    it('sets the logger via setLogger', async () => {
      const middleware = observabilityMiddleware()
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      await middleware.before?.(request)

      expect(setLogger).toHaveBeenCalledWith(expect.any(Object))
    })

    it('extracts requestId from API Gateway event', async () => {
      const mockLogger = {
        appendKeys: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        addContext: vi.fn(),
        removeKeys: vi.fn(),
      }
      vi.mocked(createLogger).mockReturnValueOnce(mockLogger)

      const middleware = observabilityMiddleware()
      const request = {
        event: {
          requestContext: {
            requestId: 'api-gateway-request-id',
          },
        },
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      await middleware.before?.(request)

      expect(mockLogger.appendKeys).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'api-gateway-request-id',
        }),
      )
    })

    it('extracts correlationId from headers', async () => {
      const mockLogger = {
        appendKeys: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        addContext: vi.fn(),
        removeKeys: vi.fn(),
      }
      vi.mocked(createLogger).mockReturnValueOnce(mockLogger)

      const middleware = observabilityMiddleware()
      const request = {
        event: {
          headers: {
            'x-correlation-id': 'custom-correlation-id',
          },
        },
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      await middleware.before?.(request)

      expect(mockLogger.appendKeys).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'custom-correlation-id',
        }),
      )
    })

    it('extracts userId from authorizer context', async () => {
      const mockLogger = {
        appendKeys: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        addContext: vi.fn(),
        removeKeys: vi.fn(),
      }
      vi.mocked(createLogger).mockReturnValueOnce(mockLogger)

      const middleware = observabilityMiddleware()
      const request = {
        event: {
          requestContext: {
            authorizer: {
              lambda: {
                userId: 'user-123',
              },
            },
          },
        },
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      await middleware.before?.(request)

      expect(mockLogger.appendKeys).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        }),
      )
    })
  })

  describe('tracing', () => {
    it('skips tracing when skipTracing option is true', () => {
      observabilityMiddleware({ skipTracing: true })

      expect(vi.mocked(createTracer)).not.toHaveBeenCalled()
    })

    it('creates tracer when in native Lambda environment', () => {
      process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x'

      observabilityMiddleware({ skipTracing: false })

      expect(vi.mocked(createTracer)).toHaveBeenCalled()
    })

    it('opens the tracer subsegment BEFORE putAnnotation so the facade segment is never annotated', async () => {
      // Regression pin for Powertools' "cannot annotate the main segment in a Lambda
      // execution environment" warning. Order matters: captureLambdaHandler.before must
      // run before the middleware calls putAnnotation, otherwise annotations land on the
      // Lambda facade segment (which Powertools refuses to annotate).
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      const calls: string[] = []
      const putAnnotation = vi.fn(() => {
        calls.push('putAnnotation')
      })
      const tracerBefore = vi.fn(() => {
        calls.push('tracerBefore')
      })
      vi.mocked(createTracer).mockReturnValueOnce({
        putAnnotation,
        putMetadata: vi.fn(),
      } as unknown as ReturnType<typeof createTracer>)
      vi.mocked(captureLambdaHandler).mockReturnValueOnce({
        before: tracerBefore,
        after: vi.fn(),
        onError: vi.fn(),
      })

      const middleware = observabilityMiddleware({ skipTracing: false })
      await middleware.before?.({
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {},
        response: undefined,
        error: null,
      })

      expect(calls).toEqual(['tracerBefore', 'putAnnotation'])
    })

    it('closes the tracer subsegment AFTER metrics flush so metrics land inside the subsegment scope', async () => {
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      const { logMetrics } = await import('@aws-lambda-powertools/metrics/middleware')
      const calls: string[] = []
      // Give the metrics mock a strictly-later resolution (macrotask via setTimeout)
      // than the tracer mock (single microtask hop). A regression dropping `await` on
      // `metricsMiddleware.after` would let tracer.after resolve first — pushing
      // 'tracerAfter' before 'metricsAfter' — and fail this assertion. A same-tier
      // microtask hop on both sides wouldn't catch that: FIFO drain would still put
      // metrics first because it was queued first, matching the awaited case.
      const metricsAfter = vi.fn(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              calls.push('metricsAfter')
              resolve()
            }, 0),
          ),
      )
      const tracerAfter = vi.fn(() =>
        Promise.resolve().then(() => {
          calls.push('tracerAfter')
        }),
      )
      vi.mocked(captureLambdaHandler).mockReturnValueOnce({
        before: vi.fn(),
        after: tracerAfter,
        onError: vi.fn(),
      })
      vi.mocked(logMetrics).mockReturnValueOnce({
        before: vi.fn(),
        after: metricsAfter,
        onError: vi.fn(),
      })

      const middleware = observabilityMiddleware({ skipTracing: false })
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {},
        response: undefined,
        error: null,
      }
      // Real lifecycle — before then after — so the tracer/metrics flags are set to true
      // and both cleanup steps actually run.
      await middleware.before?.(request)
      await middleware.after?.(request)

      expect(calls).toEqual(['metricsAfter', 'tracerAfter'])
    })

    it('closes the tracer subsegment even when metrics.after throws — and does so AFTER metrics ran', async () => {
      // The subsegment MUST close on every path — a metrics-flush throw that leaked the
      // subsegment would corrupt every subsequent invocation in the warm container.
      // Order tracking guards against an inverted try/finally (tracer in try, metrics
      // in finally) that would satisfy a call-count-only assertion.
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      const { logMetrics } = await import('@aws-lambda-powertools/metrics/middleware')
      const calls: string[] = []
      const tracerAfter = vi.fn(() => {
        calls.push('tracerAfter')
      })
      vi.mocked(captureLambdaHandler).mockReturnValueOnce({
        before: vi.fn(),
        after: tracerAfter,
        onError: vi.fn(),
      })
      vi.mocked(logMetrics).mockReturnValueOnce({
        before: vi.fn(),
        after: vi.fn(() => {
          calls.push('metricsAfter')
          throw new Error('EMF flush failed')
        }),
        onError: vi.fn(),
      })

      const middleware = observabilityMiddleware({ skipTracing: false })
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {},
        response: undefined,
        error: null,
      }
      await middleware.before?.(request)
      await expect(middleware.after?.(request)).rejects.toThrow('EMF flush failed')

      expect(calls).toEqual(['metricsAfter', 'tracerAfter'])
      expect(tracerAfter).toHaveBeenCalledTimes(1)
    })

    it('closes the tracer subsegment even when metrics.onError throws — and does so AFTER metrics ran', async () => {
      // Same invariant on the error path — where the leak matters most.
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      const { logMetrics } = await import('@aws-lambda-powertools/metrics/middleware')
      const calls: string[] = []
      const tracerOnError = vi.fn(() => {
        calls.push('tracerOnError')
      })
      vi.mocked(captureLambdaHandler).mockReturnValueOnce({
        before: vi.fn(),
        after: vi.fn(),
        onError: tracerOnError,
      })
      vi.mocked(logMetrics).mockReturnValueOnce({
        before: vi.fn(),
        after: vi.fn(),
        onError: vi.fn(() => {
          calls.push('metricsOnError')
          throw new Error('EMF flush failed')
        }),
      })

      const middleware = observabilityMiddleware({ skipTracing: false })
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {},
        response: undefined,
        error: new Error('handler failed'),
      }
      await middleware.before?.(request)
      await expect(middleware.onError?.(request)).rejects.toThrow('EMF flush failed')

      expect(calls).toEqual(['metricsOnError', 'tracerOnError'])
      expect(tracerOnError).toHaveBeenCalledTimes(1)
    })

    it('does not call `after` cleanup on sub-middlewares whose `before` never ran (no unpaired close)', async () => {
      // If `before` never opened the subsegment, `after`/`onError` MUST NOT call the
      // tracer's cleanup — Powertools reads a segment stack and closing without a paired
      // open corrupts trace state or throws "no subsegment on the stack".
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      const { logMetrics } = await import('@aws-lambda-powertools/metrics/middleware')
      const tracerAfter = vi.fn()
      const metricsAfter = vi.fn()
      vi.mocked(captureLambdaHandler).mockReturnValueOnce({
        before: vi.fn(),
        after: tracerAfter,
        onError: vi.fn(),
      })
      vi.mocked(logMetrics).mockReturnValueOnce({
        before: vi.fn(),
        after: metricsAfter,
        onError: vi.fn(),
      })

      const middleware = observabilityMiddleware({ skipTracing: false })
      // Call `after` on a fresh middleware whose `before` was never invoked (models
      // a chained user middleware short-circuiting before observability's `before`).
      await middleware.after?.({
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {},
        response: undefined,
        error: null,
      })

      expect(tracerAfter).not.toHaveBeenCalled()
      expect(metricsAfter).not.toHaveBeenCalled()
    })

    it('does not call `onError` cleanup on sub-middlewares whose `before` never ran', async () => {
      // Symmetric guard for the error path: if middy invokes onError without observability's
      // `before` running (upstream middleware threw), the tracer/metrics closes must be
      // suppressed. A regression that inverted only one branch of `if (metricsStarted)`
      // or `if (tracerOpened)` in `onError` would slip past the `.after` sibling test.
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      const { logMetrics } = await import('@aws-lambda-powertools/metrics/middleware')
      const tracerOnError = vi.fn()
      const metricsOnError = vi.fn()
      vi.mocked(captureLambdaHandler).mockReturnValueOnce({
        before: vi.fn(),
        after: vi.fn(),
        onError: tracerOnError,
      })
      vi.mocked(logMetrics).mockReturnValueOnce({
        before: vi.fn(),
        after: vi.fn(),
        onError: metricsOnError,
      })

      const middleware = observabilityMiddleware({ skipTracing: false })
      await middleware.onError?.({
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {},
        response: undefined,
        error: new Error('upstream failed'),
      })

      expect(tracerOnError).not.toHaveBeenCalled()
      expect(metricsOnError).not.toHaveBeenCalled()
    })

    it('does not attach a tracer middleware when tracing is skipped', async () => {
      const { captureLambdaHandler } = await import('@aws-lambda-powertools/tracer/middleware')
      vi.mocked(captureLambdaHandler).mockClear()

      observabilityMiddleware({ skipTracing: true })

      expect(vi.mocked(captureLambdaHandler)).not.toHaveBeenCalled()
    })
  })
})
