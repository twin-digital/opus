# @twin-digital/logger-lib

Generic logging interface and context management for TypeScript applications.

## Overview

This library provides a common `Logger` interface and contextual logger pattern using Node.js AsyncLocalStorage. Write code that logs via `getLogger()` without coupling to a specific logging implementation.

## Default Implementations

### consoleLogger

Simple console-based logger for development and testing.

```typescript
import { consoleLogger } from '@twin-digital/logger-lib'

consoleLogger.info('Application started')
consoleLogger.error('Something went wrong', { error })
```

### noopLogger

Silent logger that discards all log statements. Useful for testing or disabling logs.

## Contextual Logging

### Why?

In serverless and async environments (AWS Lambda, HTTP servers), you need logger instances with request-specific context (requestId, userId, correlationId) without passing loggers through every function call.

### When?

Use contextual logging when:

- Building AWS Lambda functions with per-request context
- Writing middleware that needs to inject contextual information
- Testing code that depends on loggers without complex dependency injection

### How?

**Set logger context (middleware pattern):**

```typescript
import { setLogger } from '@twin-digital/logger-lib'

// In middleware/setup code
const logger = createLogger({ serviceName: 'my-service' })
logger.appendKeys({ requestId, userId })
setLogger(logger)
```

**Get logger anywhere in your code:**

```typescript
import { getLogger } from '@twin-digital/logger-lib'

async function processOrder(orderId: string) {
  const logger = getLogger() // Gets contextual logger automatically
  logger.info('Processing order', { orderId })

  await validateOrder(orderId) // Logger context maintained across async calls

  logger.info('Order processed')
}
```

**Wrap operations with scoped context:**

```typescript
import { runWithLogger } from '@twin-digital/logger-lib'

// For testing or scoped operations
await runWithLogger(mockLogger, async () => {
  await myFunction() // Uses mockLogger via getLogger()
})
// Context automatically reverts after callback
```

## Context Isolation

Logger context is automatically isolated between:

- Concurrent AWS Lambda invocations
- Concurrent HTTP requests
- Parallel async operations

No explicit cleanup required - AsyncLocalStorage handles it.

## Fallback Behavior

`getLogger()` returns a console-based logger when no context is set, ensuring your code always works even without explicit logger setup.
