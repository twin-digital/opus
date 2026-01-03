import { DynamoDBDocumentClient, GetCommand, type GetCommandInput } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda'
import { mockClient } from 'aws-sdk-client-mock'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { rawHandler } from './authorizer.js'
import {
  EmfMetricsCapture,
  createMockObservabilityContext,
  createMockLambdaContext,
} from '@twin-digital/lambda-test-lib'

const dynamoMock = mockClient(DynamoDBDocumentClient)

/**
 * Create a mock authorizer event
 */
function createAuthorizerEvent(authorization?: string): APIGatewayRequestAuthorizerEventV2 {
  return {
    version: '2.0',
    type: 'REQUEST',
    routeArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/test/POST/render/html',
    identitySource: ['$request.header.Authorization'],
    routeKey: 'POST /render/html',
    rawPath: '/render/html',
    rawQueryString: '',
    cookies: [],
    headers: authorization ? { authorization } : {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'abcdef123',
      domainName: 'abcdef123.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'abcdef123',
      http: {
        method: 'POST',
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
  }
}

const mockContext = createMockLambdaContext({ functionName: 'authorizer' })

describe('authorizer', () => {
  beforeEach(() => {
    dynamoMock.reset()
    vi.stubEnv('API_KEYS_TABLE', 'test-api-keys-table')
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
  })

  describe('missing authorization header', () => {
    it('should return unauthorized when no authorization header is provided', async () => {
      const event = createAuthorizerEvent()
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })
  })

  describe('invalid header formats', () => {
    it('should return unauthorized for empty string authorization header', async () => {
      const event = createAuthorizerEvent('')
      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })

    it('should accept Bearer token format', async () => {
      const event = createAuthorizerEvent('Bearer test-api-key-12345')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: 'test-api-key-12345',
          userId: 'user-123',
          scopes: ['render:html', 'render:pdf'],
          rateLimitTier: 'pro',
          revoked: false,
          createdAt: '2024-01-01T00:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.isAuthorized).toBe(true)
      expect(dynamoMock.call(0).args[0].input).toMatchObject({
        TableName: 'test-api-keys-table',
        Key: { keyId: 'test-api-key-12345' },
      })
    })

    it('should accept raw API key without Bearer prefix', async () => {
      const event = createAuthorizerEvent('test-api-key-12345')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: 'test-api-key-12345',
          userId: 'user-123',
          scopes: ['render:html'],
          rateLimitTier: 'free',
          revoked: false,
          createdAt: '2024-01-01T00:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.isAuthorized).toBe(true)
    })

    it('should extract key correctly when Bearer has extra spaces', async () => {
      const event = createAuthorizerEvent('Bearer  test-key-with-spaces')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: ' test-key-with-spaces',
          userId: 'user-123',
          scopes: [],
          rateLimitTier: 'free',
          revoked: false,
          createdAt: '2024-01-01T00:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      // Should try to look up the key with leading space
      expect(dynamoMock.call(0).args[0].input).toMatchObject({
        Key: { keyId: ' test-key-with-spaces' },
      })
    })
  })

  describe('missing table name environment variable', () => {
    it('should use empty string as table name when API_KEYS_TABLE env var is not set', async () => {
      vi.unstubAllEnvs()

      const event = createAuthorizerEvent('Bearer test-key')

      // Mock DynamoDB to reject with table not found error
      dynamoMock.on(GetCommand).rejects({
        name: 'ResourceNotFoundException',
        message: 'Requested resource not found',
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.isAuthorized).toBe(false)
      expect((dynamoMock.call(0).args[0].input as GetCommandInput).TableName).toBe('')
    })
  })

  describe('API key not found in database', () => {
    it('should return unauthorized when API key does not exist', async () => {
      const event = createAuthorizerEvent('Bearer nonexistent-key')

      // DynamoDB returns empty result when item not found
      dynamoMock.on(GetCommand).resolves({})

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })

    it('should return unauthorized when DynamoDB returns Item=undefined', async () => {
      const event = createAuthorizerEvent('Bearer nonexistent-key')

      dynamoMock.on(GetCommand).resolves({
        Item: undefined,
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })
  })

  describe('API key is revoked', () => {
    it('should return unauthorized when revoked field is true', async () => {
      const event = createAuthorizerEvent('Bearer revoked-key-12345')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: 'revoked-key-12345',
          userId: 'user-123',
          scopes: ['render:html'],
          rateLimitTier: 'free',
          revoked: true,
          createdAt: '2024-01-01T00:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })
  })

  describe('happy path', () => {
    it('should authorize valid API key and return context with scopes array', async () => {
      const event = createAuthorizerEvent('Bearer valid-key-12345')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: 'valid-key-12345',
          userId: 'user-456',
          scopes: ['render:html', 'render:pdf', 'admin:users'],
          rateLimitTier: 'enterprise',
          revoked: false,
          createdAt: '2024-01-01T12:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: true,
        context: {
          userId: 'user-456',
          keyId: 'valid-key-12345',
          scopes: '["render:html","render:pdf","admin:users"]',
          rateLimitTier: 'enterprise',
        },
      })
    })

    it('should handle missing optional fields with defaults', async () => {
      const event = createAuthorizerEvent('Bearer minimal-key')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: 'minimal-key',
          userId: 'user-789',
          // Missing scopes, rateLimitTier, revoked fields
          createdAt: '2024-01-01T00:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: true,
        context: {
          userId: 'user-789',
          keyId: 'minimal-key',
          scopes: '[]',
          rateLimitTier: 'free',
        },
      })
    })

    it('should handle empty scopes array', async () => {
      const event = createAuthorizerEvent('Bearer key-no-scopes')

      dynamoMock.on(GetCommand).resolves({
        Item: {
          keyId: 'key-no-scopes',
          userId: 'user-111',
          scopes: [],
          rateLimitTier: 'free',
          revoked: false,
          createdAt: '2024-01-01T00:00:00Z',
        },
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result.isAuthorized).toBe(true)
      expect(result.context.scopes).toBe('[]')
    })
  })

  describe('error handling', () => {
    it('should return unauthorized when DynamoDB throws error', async () => {
      const event = createAuthorizerEvent('Bearer error-key')

      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB connection failed'))

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })

    it('should return unauthorized when DynamoDB throws throttling error', async () => {
      const event = createAuthorizerEvent('Bearer throttled-key')

      dynamoMock.on(GetCommand).rejects({
        name: 'ProvisionedThroughputExceededException',
        message: 'Rate of requests exceeds the allowed throughput',
      })

      const context = createMockObservabilityContext()
      const result = await rawHandler(event, context)

      expect(result).toEqual({
        isAuthorized: false,
        context: { userId: '', keyId: '', scopes: '[]', rateLimitTier: 'free' },
      })
    })
  })
})

describe('integration - with observability middleware', () => {
  const metricsCapture = new EmfMetricsCapture()

  beforeEach(() => {
    dynamoMock.reset()
    vi.stubEnv('API_KEYS_TABLE', 'test-api-keys-table')
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
    metricsCapture.start()
  })

  afterEach(() => {
    metricsCapture.stop()
  })

  it('revoked key usage emits correct EMF metrics', async () => {
    // Import the wrapped handler (use real observability factories)
    const { handler } = await import('./authorizer.js')

    // Revoked key event - this is a security event that emits metrics
    const event = createAuthorizerEvent('Bearer revoked-test-key')

    dynamoMock.on(GetCommand).resolves({
      Item: {
        keyId: 'revoked-test-key',
        userId: 'user-456',
        scopes: ['render:html'],
        rateLimitTier: 'premium',
        revoked: true,
        createdAt: '2024-01-01T00:00:00Z',
      },
    })

    const result = await handler(event, mockContext)

    expect(result.isAuthorized).toBe(false)

    // Verify EMF metrics for revoked key security event
    metricsCapture.expectMetric('AuthDeniedRevoked', 1)
  })
})
