# @twin-digital/observability-lib

AWS Lambda observability utilities wrapping AWS Lambda Powertools for structured logging, metrics, and distributed tracing.

## Installation

```bash
pnpm add @twin-digital/observability-lib
```

## Quick Start

```typescript
import { withObservability, MetricUnit } from '@twin-digital/observability-lib'

export const handler = withObservability(
  async (event, context, { internal }) => {
    const { logger, metrics } = internal

    // Log business events (NOT Lambda invocations)
    logger.info('Processing order', { orderId: event.orderId })

    // Record business metrics
    metrics.addMetric('OrderProcessed', MetricUnit.Count, 1)

    return { statusCode: 200, body: 'Success' }
  },
  { serviceName: 'order-service' },
)
```

## Core Concepts

### Service Name Scope

**Service names should be scoped per microservice/bounded context, NOT per Lambda function.**

✅ **Good Practice**:

```typescript
// All Lambdas in the same service share a service name
serviceName: 'bookify-render' // Used by authorizer, render-html, version Lambdas
serviceName: 'payment-service' // Used by all payment-related Lambdas
serviceName: 'user-management' // Used by all user Lambdas
```

❌ **Bad Practice**:

```typescript
// Don't use function-specific names
serviceName: 'bookify-authorizer' // Too granular
serviceName: 'bookify-render-html' // Too granular
```

This allows you to aggregate metrics and traces across related functions.

### Logging Best Practices

**⚠️ DO NOT log Lambda invocation start/end events** - AWS already tracks invocations, duration, and errors automatically in CloudWatch metrics.

✅ **Good - Log business events**:

```typescript
logger.info('Order validated', { orderId, userId })
logger.warn('Payment retry required', { attempt: 3, reason })
logger.error('Order processing failed', { error, orderId })
```

❌ **Bad - Logging framework events (too noisy/expensive)**:

```typescript
logger.info('Lambda invocation started') // ❌ Redundant
logger.info('Lambda completed') // ❌ Redundant
logger.debug('Processing request') // ❌ Too generic
```

### Accessing Logger and Metrics

The middleware injects logger, metrics, and tracer into the **third parameter** of your handler:

```typescript
;async (event, context, { internal }) => {
  const { logger, metrics, tracer } = internal

  logger.info('User authenticated', { userId: event.userId })
  metrics.addMetric('AuthSuccess', MetricUnit.Count, 1)

  if (tracer) {
    tracer.putMetadata('requestDetails', event.body)
  }
}
```

Note: when you use the middleware it sets a per-invocation logger into the async context.
You can call `getLogger()` (from `@twin-digital/logger-lib`) anywhere in your code to obtain
the contextual logger without passing it through function arguments. For scoped or test
use-cases, wrap operations with `runWithLogger(logger, callback)` to run code with an
isolated logger context that automatically reverts after the callback completes.

## API Reference

### `withObservability(handler, options)`

Wraps a Lambda handler with observability middleware.

#### Options

| Option             | Type      | Default                   | Description                                                       |
| ------------------ | --------- | ------------------------- | ----------------------------------------------------------------- |
| `serviceName`      | `string`  | `POWERTOOLS_SERVICE_NAME` | Service name for observability (per microservice, not per Lambda) |
| `logEvent`         | `boolean` | `false`                   | Log incoming events (⚠️ may log sensitive data)                   |
| `captureResponse`  | `boolean` | `true`                    | Capture HTTP responses in X-Ray traces                            |
| `skipTracing`      | `boolean` | auto-detect               | Skip X-Ray tracing (auto-disabled for containers)                 |
| `captureColdStart` | `boolean` | `true`                    | Record cold start metrics automatically                           |

#### Example

```typescript
import { withObservability, MetricUnit } from '@twin-digital/observability-lib'

export const handler = withObservability(
  async (event, context, { internal }) => {
    const { logger, metrics } = internal

    logger.info('Processing payment', { amount: event.amount })
    metrics.addMetric('PaymentProcessed', MetricUnit.Count, 1)
    metrics.addDimension('Currency', event.currency)

    return { statusCode: 200, body: 'Payment processed' }
  },
  {
    serviceName: 'payment-service',
    captureColdStart: true,
  },
)
```

### `createLogger(options)`

Creates a standalone logger instance (use when not using middleware).

```typescript
import { createLogger } from '@twin-digital/observability-lib'

const logger = createLogger({ serviceName: 'my-service', logLevel: 'INFO' })

logger.info('User signed up', { userId: '123' })
logger.error('Database connection failed', { error })

// Add persistent context
logger.appendKeys({ tenantId: 'acme-corp' })
```

### `createMetrics(options)`

Creates a standalone metrics instance (use when not using middleware).

```typescript
import { createMetrics, MetricUnit } from '@twin-digital/observability-lib'

const metrics = createMetrics({
  namespace: 'MyApp/Orders',
  serviceName: 'order-service',
})

metrics.addMetric('OrdersProcessed', MetricUnit.Count, 1)
metrics.addDimension('OrderType', 'subscription')
metrics.publishStoredMetrics() // Required if not using middleware
```

### `createTracer(options)`

Creates a standalone X-Ray tracer instance (use when not using middleware).

```typescript
import { createTracer } from '@twin-digital/observability-lib'

const tracer = createTracer({ serviceName: 'my-service' })

// Add annotations (indexed, searchable)
tracer.putAnnotation('userId', '123')

// Add metadata (visible but not indexed)
tracer.putMetadata('requestPayload', event.body)
```

## Serverless Framework Configuration

Add these environment variables to your `serverless.yml`:

```yaml
provider:
  environment:
    POWERTOOLS_SERVICE_NAME: ${self:service}
    POWERTOOLS_LOG_LEVEL: ${self:custom.logLevel.${self:provider.stage}, 'INFO'}
    POWERTOOLS_METRICS_NAMESPACE: MyApp/${self:service}

  # Enable X-Ray tracing
  tracing:
    lambda: true

custom:
  logLevel:
    dev: DEBUG
    prod: INFO
```

## Log Output Format

Logs are JSON-formatted for CloudWatch Logs Insights:

```json
{
  "level": "INFO",
  "message": "Order validated",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "order-service",
  "requestId": "abc-123",
  "correlationId": "req-789",
  "userId": "user-456",
  "data": [{ "orderId": "order-123" }]
}
```

## Metrics Output Format

Metrics use CloudWatch Embedded Metric Format (EMF):

```json
{
  "_aws": {
    "Timestamp": 1705318200000,
    "CloudWatchMetrics": [
      {
        "Namespace": "MyApp/OrderService",
        "Dimensions": [["service"]],
        "Metrics": [
          { "Name": "OrderProcessed", "Unit": "Count" },
          { "Name": "ColdStart", "Unit": "Count" }
        ]
      }
    ]
  },
  "service": "order-service",
  "OrderProcessed": 1,
  "ColdStart": 1
}
```

## Migration Guide

### From Console Logging

**Before**:

```typescript
export const handler = async (event) => {
  console.log('Processing request', JSON.stringify(event))
  console.error('Error occurred:', error)
  return { statusCode: 200 }
}
```

**After**:

```typescript
import { withObservability } from '@twin-digital/observability-lib'

export const handler = withObservability(
  async (event, context, { internal }) => {
    const { logger } = internal
    logger.info('Processing order', { orderId: event.orderId })
    return { statusCode: 200 }
  },
  { serviceName: 'order-service' },
)
```

### From Manual Powertools Setup

**Before**:

```typescript
import { Logger } from '@aws-lambda-powertools/logger'
import { Metrics } from '@aws-lambda-powertools/metrics'

const logger = new Logger()
const metrics = new Metrics()

export const handler = async (event) => {
  logger.info('Processing')
  metrics.addMetric('Processed', MetricUnit.Count, 1)
  metrics.publishStoredMetrics()
  return { statusCode: 200 }
}
```

**After**:

```typescript
import { withObservability, MetricUnit } from '@twin-digital/observability-lib'

export const handler = withObservability(
  async (event, context, { internal }) => {
    const { logger, metrics } = internal
    logger.info('Order processed', { orderId: event.orderId })
    metrics.addMetric('Processed', MetricUnit.Count, 1)
    // No need to call publishStoredMetrics() - handled by middleware
    return { statusCode: 200 }
  },
  { serviceName: 'order-service' },
)
```

## Advanced Usage

### Middleware Composition

```typescript
import middy from '@middy/core'
import { observabilityMiddleware } from '@twin-digital/observability-lib'
import httpErrorHandler from '@middy/http-error-handler'

const handler = middy(async (event, context, { internal }) => {
  const { logger } = internal
  logger.info('Processing HTTP request')
  return { statusCode: 200, body: 'OK' }
})
  .use(observabilityMiddleware({ serviceName: 'api-service' }))
  .use(httpErrorHandler())

export { handler }
```

### Custom Metric Dimensions

```typescript
export const handler = withObservability(
  async (event, context, { internal }) => {
    const { metrics } = internal

    // Add dimensions for filtering/grouping
    metrics.addDimension('Environment', process.env.STAGE)
    metrics.addDimension('Region', process.env.AWS_REGION)
    metrics.addDimension('OrderType', event.orderType)

    metrics.addMetric('OrderCreated', MetricUnit.Count, 1)

    return { statusCode: 200 }
  },
  { serviceName: 'order-service' },
)
```

### Conditional Tracing

```typescript
export const handler = withObservability(
  async (event, context, { internal }) => {
    const { tracer } = internal

    if (tracer) {
      // Only add traces when X-Ray is available
      tracer.putAnnotation('orderId', event.orderId)
      tracer.putMetadata('orderDetails', event.items)
    }

    return { statusCode: 200 }
  },
  {
    serviceName: 'order-service',
    skipTracing: false, // Enable tracing explicitly
  },
)
```

## Troubleshooting

### Logger Context Not Appearing

**Problem**: Logger context (requestId, userId) not showing in logs.

**Solution**: Ensure you're using the logger from `internal`, not creating a new instance:

```typescript
// ✅ Correct
;async (event, context, { internal }) => {
  const { logger } = internal
  logger.info('Message')
}

// ❌ Wrong
import { createLogger } from '@twin-digital/observability-lib'
const logger = createLogger() // Creates new instance without context
```

### Metrics Not Publishing

**Problem**: Metrics not appearing in CloudWatch.

**Solution**: The middleware automatically publishes metrics. Don't call `publishStoredMetrics()` manually when using the middleware.

### X-Ray Traces Missing

**Problem**: No traces in X-Ray console.

**Solution**:

1. Ensure X-Ray is enabled in serverless.yml: `tracing.lambda: true`
2. Check if running in container - tracing auto-disables for containers without X-Ray daemon
3. Override with `skipTracing: false` if needed

## License

MIT
