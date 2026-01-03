import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { rawHandler } from './version.js'
import { createMockObservabilityContext, createMockLambdaContext } from '@twin-digital/lambda-test-lib'

/**
 * Type for version response body
 */
interface VersionResponseBody {
  apiVersion: string
  pandocVersion: string
}

/**
 * Parse version response body with type safety
 */
function parseVersionBody(body: string | undefined): VersionResponseBody {
  return JSON.parse(body ?? '{}') as VersionResponseBody
}

/**
 * Create a mock version event
 */
function createVersionEvent(): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /version',
    rawPath: '/version',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'abcdef123',
      domainName: 'abcdef123.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'abcdef123',
      http: {
        method: 'GET',
        path: '/version',
        protocol: 'HTTP/1.1',
        sourceIp: '192.0.2.1',
        userAgent: 'vitest-test',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /version',
      stage: 'test',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    isBase64Encoded: false,
  }
}

describe('version handler', () => {
  beforeEach(() => {
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
  })

  it('should return API version and pandoc version', async () => {
    const event = createVersionEvent()
    const context = createMockObservabilityContext()
    const result = (await rawHandler(event, context)) as APIGatewayProxyStructuredResultV2

    expect(result.statusCode).toBe(200)
    expect(result.headers!['Content-Type']).toBe('application/json')

    const body = parseVersionBody(result.body)
    expect(body).toHaveProperty('apiVersion')
    expect(body).toHaveProperty('pandocVersion')
    expect(typeof body.apiVersion).toBe('string')
    expect(typeof body.pandocVersion).toBe('string')
  })
})

describe('integration - with observability middleware', () => {
  it('handler returns version info', async () => {
    // Import the wrapped handler
    const { handler } = await import('./version.js')

    const event = createVersionEvent()
    const context = createMockLambdaContext({ functionName: 'version' })

    const result = (await handler(event, context)) as APIGatewayProxyStructuredResultV2

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body!)
    expect(body).toHaveProperty('apiVersion')
    expect(body).toHaveProperty('pandocVersion')
  })
})
