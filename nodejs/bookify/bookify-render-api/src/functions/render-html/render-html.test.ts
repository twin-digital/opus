import { describe, expect, it } from 'vitest'
import { handler } from './render-html.js'
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda'

describe('render-html handler', () => {
  it('should return 200 with JSON response', async () => {
    // Arrange
    const mockEvent: APIGatewayProxyEventV2 = {
      version: '2.0',
      routeKey: '$default',
      rawPath: '/render',
      rawQueryString: '',
      headers: {},
      requestContext: {
        accountId: '123456789012',
        apiId: 'api-id',
        domainName: 'example.com',
        domainPrefix: 'api',
        http: {
          method: 'POST',
          path: '/render',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
        requestId: 'test-request-id',
        routeKey: '$default',
        stage: '$default',
        time: '01/Jan/2025:00:00:00 +0000',
        timeEpoch: 1704067200000,
      },
      isBase64Encoded: false,
    }

    const mockContext: Context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      memoryLimitInMB: '128',
      awsRequestId: 'test-aws-request-id',
      logGroupName: '/aws/lambda/test-function',
      logStreamName: '2025/01/01/[$LATEST]abcd1234',
      getRemainingTimeInMillis: () => 30000,
      done: (_error?: Error, _result?: unknown) => {
        // Mock implementation
      },
      fail: (_error: Error | string) => {
        // Mock implementation
      },
      succeed: (_messageOrObject: unknown) => {
        // Mock implementation
      },
    }

    // Act
    const response = await handler(mockEvent, mockContext)

    // Assert
    if (typeof response === 'string') {
      throw new Error('Expected object response, got string')
    }

    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
    })

    if (!response.body) {
      throw new Error('Expected response body')
    }

    const body = JSON.parse(response.body) as {
      message: string
      timestamp: string
      requestId: string
      path: string
      method: string
    }

    expect(body).toMatchObject({
      message: 'Hello from Bookify!',
      requestId: 'test-aws-request-id',
      path: '/render',
      method: 'POST',
    })
    expect(body.timestamp).toBeDefined()
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0)
  })
})
