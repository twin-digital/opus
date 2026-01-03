# @twin-digital/lambda-test-lib

Test helpers for AWS Lambda functions, including mock contexts and EMF metrics capture.

## Installation

```bash
pnpm add -D @twin-digital/lambda-test-lib
```

## Lambda Mock Utilities

Create mock Lambda contexts and observability contexts for unit testing.

### createMockLambdaContext

Create a mock AWS Lambda Context object.

```typescript
import { createMockLambdaContext } from '@twin-digital/lambda-test-lib'

const context = createMockLambdaContext()
const result = await handler(event, context)
```

With custom options:

```typescript
const context = createMockLambdaContext({
  functionName: 'my-function',
  awsRequestId: 'custom-request-id',
  remainingTimeMs: 5000,
})
```

### createMockObservabilityContext

Create a mock observability context for testing handlers that use `withObservability`.

```typescript
import { createMockObservabilityContext } from '@twin-digital/lambda-test-lib'

const context = createMockObservabilityContext()
const result = await rawHandler(event, context)

// Assert on logger calls
expect(context.logger.info).toHaveBeenCalledWith('Request processed')

// Assert on metrics
expect(context.metrics.addMetric).toHaveBeenCalledWith('RequestCount', 'Count', 1)
```

### createMockLogger / createMockMetrics

Create standalone mock logger or metrics objects.

```typescript
import { createMockLogger, createMockMetrics } from '@twin-digital/lambda-test-lib'

const logger = createMockLogger()
myFunction(logger)
expect(logger.warn).toHaveBeenCalled()

const metrics = createMockMetrics()
myOtherFunction(metrics)
expect(metrics.addDimension).toHaveBeenCalledWith('reason', 'invalid')
```

## EmfMetricsCapture

Helper class for capturing and asserting on EMF (Embedded Metric Format) metrics in integration tests.

AWS Lambda Powertools Metrics writes EMF logs directly to `process.stdout` using its own Console instance. This means you can't spy on `console.log` to capture metrics. The `EmfMetricsCapture` class intercepts `process.stdout.write`, parses EMF JSON logs, and provides convenient assertion methods.

### Usage

```typescript
import { EmfMetricsCapture } from '@twin-digital/lambda-test-lib'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('my handler', () => {
  const metricsCapture = new EmfMetricsCapture()

  beforeEach(() => {
    metricsCapture.start()
  })

  afterEach(() => {
    metricsCapture.stop()
  })

  it('emits correct metrics', async () => {
    await handler(event, context)

    // Assert that a metric with specific value was emitted
    metricsCapture.expectMetric('OrderProcessed', 1)

    // Assert that a dimension exists
    metricsCapture.expectDimension('OrderType', 'standard')

    // Assert metric with specific dimensions
    metricsCapture.expectMetricWithDimensions('RequestCount', 5, {
      Region: 'us-east-1',
      Environment: 'prod',
    })
  })
})
```

### API

#### `start(): void`

Start capturing stdout to intercept EMF metrics. Call this in `beforeEach()`.

#### `stop(): void`

Stop capturing and restore original stdout. Call this in `afterEach()`.

#### `expectMetric(metricName: string, expectedValue: number): void`

Assert that a metric with the given name and value was emitted.

```typescript
metricsCapture.expectMetric('OrderProcessed', 1)
metricsCapture.expectMetric('OrderValue', 99.99)
```

#### `expectDimension(dimensionName: string, expectedValue: string): void`

Assert that a dimension with the given name and value exists in at least one EMF log.

```typescript
metricsCapture.expectDimension('OrderType', 'standard')
metricsCapture.expectDimension('Region', 'us-east-1')
```

#### `expectMetricWithDimensions(metricName: string, expectedValue: number, dimensions: Record<string, string>): void`

Assert that a metric was emitted with specific dimensions.

```typescript
metricsCapture.expectMetricWithDimensions('OrderProcessed', 1, {
  OrderType: 'standard',
  Region: 'us-east-1',
})
```

#### `expectEmfLogsEmitted(): void`

Assert that at least one EMF log was captured.

#### `getLogCount(): number`

Get the count of EMF logs captured.

#### `getEmfLogs(): Record<string, unknown>[]`

Get all captured EMF logs as parsed objects. Useful for custom assertions.

#### `getLogsWithMetric(metricName: string): Record<string, unknown>[]`

Get EMF logs that contain a specific metric name.

#### `clear(): void`

Clear captured logs. Useful between test cases if not using `start()`/`stop()`.

### Why is this needed?

When you try to spy on `console.log` in tests, it won't capture EMF metrics because:

1. AWS Lambda Powertools Metrics creates its own `Console` instance
2. This Console writes directly to `process.stdout` via `new Console({ stdout: process.stdout })`
3. The metrics bypass the global `console.log` function entirely

This helper intercepts at the `process.stdout.write` level, which is the only reliable way to capture these metrics in tests.

## Example: Complete Integration Test

```typescript
import { EmfMetricsCapture, createMockLambdaContext } from '@twin-digital/lambda-test-lib'

describe('integration - with observability middleware', () => {
  const metricsCapture = new EmfMetricsCapture()

  beforeEach(() => {
    metricsCapture.start()
    vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'test-service')
    vi.stubEnv('POWERTOOLS_METRICS_NAMESPACE', 'TestNamespace')
  })

  afterEach(() => {
    metricsCapture.stop()
  })

  it('happy path: emits success metrics', async () => {
    const context = createMockLambdaContext({ functionName: 'my-handler' })
    const result = await handler(event, context)

    expect(result.success).toBe(true)
    metricsCapture.expectMetricWithDimensions('AuthGranted', 1, { RateLimitTier: 'free' })
  })
})
```
