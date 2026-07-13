# @twin-digital/observability-lib

## 0.0.5

### Patch Changes

- 5a835b6: `observabilityMiddleware` now opens a Powertools X-Ray subsegment (via `captureLambdaHandler`) around each invocation before annotating, and closes it after metrics flush.

  Previously, `tracer.putAnnotation('correlationId', …)` ran against the Lambda-provided facade segment, which Powertools refuses to annotate — producing a "cannot annotate the main segment in a Lambda execution environment" WARN on every invocation. The middleware now composes Powertools' `captureLambdaHandler` first, so annotations land on the subsegment and the warning stops. As a bonus, the handler's execution is now a named subsegment in the X-Ray trace tree.

  No API changes; consumers using `withObservability` / `observabilityMiddleware` see the warning disappear on next deploy.
  - @twin-digital/logger-lib@0.0.1

## 0.0.4

### Patch Changes

- d3f7b5f: Fix README examples to match the actual API: logger/metrics/tracer are injected onto the handler's `context` (second parameter), not a third `{ internal }` argument.
  - @twin-digital/logger-lib@0.0.1

## 0.0.3

### Patch Changes

- 729a6a6: chore(deps): update middy-js monorepo to v7
  - @twin-digital/logger-lib@0.0.1

## 0.0.2

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
  - @twin-digital/logger-lib@0.0.1

## 0.0.1

### Patch Changes

- c697c86: initial creation of package
- Updated dependencies [c697c86]
  - @twin-digital/logger-lib@0.0.1
