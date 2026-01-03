import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import AdmZip from 'adm-zip'
import { InvalidRequestReason, RenderErrorReason } from './metrics-constants.js'
import { rawHandler } from './render-html.js'
import {
  EmfMetricsCapture,
  createMockObservabilityContext,
  createMockLambdaContext,
} from '@twin-digital/lambda-test-lib'

const mockRenderHtml = vi.fn()
vi.mock('@twin-digital/bookify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@twin-digital/bookify')>()
  return {
    ...actual,
    BookifyEngine: vi.fn(function (this: { renderHtml: typeof mockRenderHtml }) {
      this.renderHtml = mockRenderHtml
    }),
  }
})

/**
 * Type for error response body
 */
interface ErrorResponseBody {
  error: string
}

/**
 * Type for success response body
 */
interface SuccessResponseBody {
  html: string
}

/**
 * Parse error response body with type safety
 */
function parseErrorBody(body: string | undefined): ErrorResponseBody {
  return JSON.parse(body ?? '{}') as ErrorResponseBody
}

/**
 * Parse success response body with type safety
 */
function parseSuccessBody(body: string | undefined): SuccessResponseBody {
  return JSON.parse(body ?? '{}') as SuccessResponseBody
}

/**
 * Authorizer context structure from the Lambda authorizer
 */
interface AuthorizerContext {
  userId?: string
  keyId?: string
  scopes?: string
  rateLimitTier?: string
}

type RenderEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

/**
 * Create a valid .bookify.yml config
 */
function createValidConfig(): string {
  return `inputs:
  - test.md
`
}

/**
 * Create a zip file with .bookify.yml and test content
 */
function createTestZip(config?: string, addTestMd = true): Buffer {
  const zip = new AdmZip()

  zip.addFile('.bookify.yml', Buffer.from(config ?? createValidConfig(), 'utf-8'))

  if (addTestMd) {
    zip.addFile('test.md', Buffer.from('# Test\n\nHello world', 'utf-8'))
  }

  return zip.toBuffer()
}

/**
 * Create a mock render event
 */
function createRenderEvent(overrides?: {
  method?: string
  body?: string
  isBase64Encoded?: boolean
  contentLength?: string
  authorization?: string
  userId?: string
}): RenderEvent {
  const userId = overrides?.userId ?? 'user-123'

  return {
    version: '2.0',
    routeKey: 'POST /render/html',
    rawPath: '/render/html',
    rawQueryString: '',
    headers: {
      'content-type': 'application/zip',
      ...(overrides?.contentLength && { 'content-length': overrides.contentLength }),
      ...(overrides?.authorization && { authorization: overrides.authorization }),
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'abcdef123',
      domainName: 'abcdef123.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'abcdef123',
      authorizer: {
        lambda: {
          userId,
          keyId: 'test-key',
          scopes: '["render:html"]',
          rateLimitTier: 'free',
        },
      },
      http: {
        method: overrides?.method ?? 'POST',
        path: '/render/html',
        protocol: 'HTTP/1.1',
        sourceIp: '192.0.2.1',
        userAgent: 'vitest-test',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /render/html',
      stage: 'test',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    body: overrides?.body,
    isBase64Encoded: overrides?.isBase64Encoded ?? false,
  }
}

describe('render-html handler', () => {
  beforeEach(() => {
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
  })

  describe('request validation', () => {
    it('should reject GET requests', async () => {
      const event = createRenderEvent({ method: 'GET', body: 'test' })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toBe('Method must be POST')
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderInvalidRequest', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.INVALID_METHOD)
    })

    it('should reject requests without body', async () => {
      const event = createRenderEvent({ body: undefined })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toBe('Request body is required')
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderInvalidRequest', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.MISSING_BODY)
    })

    it('should reject oversized requests via content-length header', async () => {
      const event = createRenderEvent({
        body: 'test',
        contentLength: (6 * 1024 * 1024).toString(), // 6 MB
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toContain('exceeds maximum size of 5MB')
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderInvalidRequest', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.SIZE_EXCEEDED)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('sizeCategory', '5-10MB')
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Size limit exceeded',
        expect.objectContaining({ method: 'content-length' }),
      )
    })

    it('should reject oversized base64 requests', async () => {
      // Create a large buffer and encode it
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a') // 6 MB
      const event = createRenderEvent({
        body: largeBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toContain('exceeds maximum size of 5MB')
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.SIZE_EXCEEDED)
    })
  })

  describe('zip file validation', () => {
    it('should reject invalid zip files', async () => {
      const event = createRenderEvent({
        body: 'not-a-zip-file',
        isBase64Encoded: false,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toContain('Invalid zip file format')
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderError', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', RenderErrorReason.MALFORMED_INPUT)
    })

    it('should reject zip without .bookify.yml', async () => {
      const zip = new AdmZip()
      zip.addFile('test.md', Buffer.from('# Test', 'utf-8'))

      const event = createRenderEvent({
        body: zip.toBuffer().toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toBe('Zip file must contain a .bookify.yml file at the root')
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.MISSING_CONFIG)
    })

    it('should reject invalid YAML in config', async () => {
      const zip = new AdmZip()
      zip.addFile('.bookify.yml', Buffer.from('invalid: yaml: content: :', 'utf-8'))

      const event = createRenderEvent({
        body: zip.toBuffer().toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toContain('Invalid YAML')
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderError', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', RenderErrorReason.MALFORMED_INPUT)
    })
  })

  describe('path traversal security', () => {
    it('should reject absolute paths in assetPaths', async () => {
      const config = `inputs:
  - test.md
assetPaths:
  - /etc/passwd
`
      const zipBuffer = createTestZip(config)

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
        userId: 'suspicious-user',
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toContain('non-relative path')
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderPathTraversalAttempt', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.INVALID_PATH)
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Path traversal attempt detected',
        expect.objectContaining({ userId: 'suspicious-user' }),
      )
    })

    it('should reject parent directory traversal in inputs', async () => {
      const config = `inputs:
  - ../../../etc/passwd
`
      const zipBuffer = createTestZip(config)

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderPathTraversalAttempt', 'Count', 1)
      expect(context.logger.warn).toHaveBeenCalledWith('Path traversal attempt detected', expect.anything())
    })
  })

  describe('config schema validation', () => {
    it('should reject config that fails schema validation', async () => {
      const config = `invalidField: true
anotherBadField: 123
`
      const zipBuffer = createTestZip(config)

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(400)
      expect(parseErrorBody(result.body).error).toContain('Invalid .bookify.yml')
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', InvalidRequestReason.INVALID_CONFIG_SCHEMA)
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Config validation failed',
        expect.objectContaining({ errors: expect.any(String) }),
      )
    })
  })

  describe.skip('successful rendering (requires pandoc - integration)', () => {
    it('should render valid request and emit success metrics', async () => {
      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      if (result.statusCode !== 200) {
        console.log('Error response:', result.body)
      }

      expect(result.statusCode).toBe(200)
      const body = parseSuccessBody(result.body) as SuccessResponseBody & { requestId: string }
      expect(body).toHaveProperty('html')
      expect(body).toHaveProperty('requestId')
      expect(typeof body.html).toBe('string')

      // Verify success metrics
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderSuccess', 'Count', 1)
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderDuration', 'Milliseconds', expect.any(Number))

      // Verify success log
      expect(context.logger.info).toHaveBeenCalledWith(
        'Render completed successfully',
        expect.objectContaining({
          inputCount: expect.any(Number),
          outputSizeKB: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      )
    })

    it('should append userId from authorizer context', async () => {
      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
        userId: 'user-456',
      })
      const context = createMockObservabilityContext()
      await rawHandler(event, context)

      expect(context.logger.appendKeys).toHaveBeenCalledWith({ userId: 'user-456' })
    })

    it('should handle anonymous users', async () => {
      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      // Set authorizer context without userId to simulate anonymous access
      event.requestContext.authorizer = { lambda: {} }

      const context = createMockObservabilityContext()
      await rawHandler(event, context)

      expect(context.logger.appendKeys).toHaveBeenCalledWith({ userId: 'anonymous' })
    })
  })

  describe('successful rendering (mocked)', () => {
    beforeEach(() => {
      // Reset and set default mock behavior
      mockRenderHtml.mockReset()
      mockRenderHtml.mockResolvedValue('<html><body>Mocked HTML Output</body></html>')
    })

    it('should render valid request and emit success metrics', async () => {
      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(200)
      const body = parseSuccessBody(result.body) as SuccessResponseBody & { requestId: string }
      expect(body).toHaveProperty('html')
      expect(body).toHaveProperty('requestId')
      expect(typeof body.html).toBe('string')

      // Decode the base64 HTML to verify it's the mocked output
      const decodedHtml = Buffer.from(body.html, 'base64').toString('utf-8')
      expect(decodedHtml).toBe('<html><body>Mocked HTML Output</body></html>')

      // Verify BookifyEngine was called
      expect(mockRenderHtml).toHaveBeenCalledOnce()

      // Verify success metrics
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderSuccess', 'Count', 1)
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderDuration', 'Milliseconds', expect.any(Number))

      // Verify success log
      expect(context.logger.info).toHaveBeenCalledWith(
        'Render completed successfully',
        expect.objectContaining({
          inputCount: expect.any(Number),
          outputSizeKB: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      )
    })

    it('should append userId from authorizer context', async () => {
      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
        userId: 'user-456',
      })
      const context = createMockObservabilityContext()
      await rawHandler(event, context)

      expect(context.logger.appendKeys).toHaveBeenCalledWith({ userId: 'user-456' })
    })

    it('should handle anonymous users', async () => {
      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      // Set authorizer context without userId to simulate anonymous access
      event.requestContext.authorizer = { lambda: {} }

      const context = createMockObservabilityContext()
      await rawHandler(event, context)

      expect(context.logger.appendKeys).toHaveBeenCalledWith({ userId: 'anonymous' })
    })

    it('should handle engine errors gracefully', async () => {
      // Mock engine to throw error for this test
      mockRenderHtml.mockRejectedValueOnce(new Error('Render engine failed'))

      const zipBuffer = createTestZip()

      const event = createRenderEvent({
        body: zipBuffer.toString('base64'),
        isBase64Encoded: true,
      })
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.statusCode).toBe(500)
      expect(parseErrorBody(result.body).error).toContain('Failed to render')

      // Verify error metrics
      expect(context.metrics.addMetric).toHaveBeenCalledWith('RenderError', 'Count', 1)
      expect(context.metrics.addDimension).toHaveBeenCalledWith('reason', RenderErrorReason.ENGINE_ERROR)

      // Verify error log
      expect(context.logger.error).toHaveBeenCalledWith(
        'Render failed',
        expect.objectContaining({
          error: expect.any(Error),
          stage: 'engine',
        }),
      )
    })
  })
})

describe('integration - with observability middleware (mocked)', () => {
  const metricsCapture = new EmfMetricsCapture()

  beforeEach(() => {
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
    metricsCapture.start()
  })

  afterEach(() => {
    metricsCapture.stop()
  })

  it('path traversal attempt emits security metric', async () => {
    const { handler } = await import('./render-html.js')

    const config = `inputs:
  - /etc/passwd
`
    const zipBuffer = createTestZip(config)
    const event = createRenderEvent({
      body: zipBuffer.toString('base64'),
      isBase64Encoded: true,
    })
    const context = createMockLambdaContext({ functionName: 'render-html' })

    const result = await handler(event, context)

    expect(result.statusCode).toBe(400)

    // Verify both path traversal and invalid request metrics
    metricsCapture.expectMetric('RenderPathTraversalAttempt', 1)
    metricsCapture.expectMetricWithDimensions('RenderInvalidRequest', 1, {
      reason: InvalidRequestReason.INVALID_PATH,
    })
  })
})

describe.skip('integration - with observability middleware (requires pandoc)', () => {
  const metricsCapture = new EmfMetricsCapture()

  beforeEach(() => {
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
    metricsCapture.start()
  })

  afterEach(() => {
    metricsCapture.stop()
  })

  it('path traversal attempt emits security metric', async () => {
    const { handler } = await import('./render-html.js')

    const config = `inputs:
  - /etc/passwd
`
    const zipBuffer = createTestZip(config)
    const event = createRenderEvent({
      body: zipBuffer.toString('base64'),
      isBase64Encoded: true,
    })
    const context = createMockLambdaContext({ functionName: 'render-html' })

    const result = await handler(event, context)

    expect(result.statusCode).toBe(400)

    // Verify both path traversal and invalid request metrics
    metricsCapture.expectMetric('RenderPathTraversalAttempt', 1)
    metricsCapture.expectMetricWithDimensions('RenderInvalidRequest', 1, {
      reason: InvalidRequestReason.INVALID_PATH,
    })
  })
})
