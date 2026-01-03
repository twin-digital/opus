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

    it('creates middleware with custom service name', () => {
      const middleware = observabilityMiddleware({ serviceName: 'my-service' })
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      middleware.before?.(request)

      // Verify createLogger was called with the custom service name in the before hook
      expect(createLogger).toHaveBeenCalledWith({
        serviceName: 'my-service',
      })
    })
  })

  describe('before hook', () => {
    it('injects logger, metrics, and tracer into context', () => {
      const middleware = observabilityMiddleware()
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      middleware.before?.(request)

      expect(request.context.logger).toBeDefined()
      expect(request.context.metrics).toBeDefined()
      expect(request.context.tracer).toBeDefined()
    })

    it('sets the logger via setLogger', () => {
      const middleware = observabilityMiddleware()
      const request = {
        event: {},
        context: mockContext as ObservabilityContext,
        internal: {} as Record<string, unknown>,
        response: undefined,
        error: null,
      }

      middleware.before?.(request)

      expect(setLogger).toHaveBeenCalledWith(expect.any(Object))
    })

    it('extracts requestId from API Gateway event', () => {
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

      middleware.before?.(request)

      expect(mockLogger.appendKeys).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'api-gateway-request-id',
        }),
      )
    })

    it('extracts correlationId from headers', () => {
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

      middleware.before?.(request)

      expect(mockLogger.appendKeys).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'custom-correlation-id',
        }),
      )
    })

    it('extracts userId from authorizer context', () => {
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

      middleware.before?.(request)

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
  })
})
