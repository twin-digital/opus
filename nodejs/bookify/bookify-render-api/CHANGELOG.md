# @twin-digital/bookify-render-api

## 0.1.6

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
- Updated dependencies [68e432d]
  - @twin-digital/bookify@0.4.1
  - @twin-digital/observability-lib@0.0.2

## 0.1.5

### Patch Changes

- c167d0b: fix invalid serverless configuration for observability resources
- Updated dependencies [1b55066]
  - @twin-digital/bookify@0.4.0

## 0.1.4

### Patch Changes

- 1bcc5cf: Fix deployment error caused by incorrect alarm configuration syntax. Changed 'function:' to 'functionName:' for all function-level alarms in serverless.yml to match the expected parameter name for serverless-plugin-aws-alerts.

## 0.1.3

### Patch Changes

- 3e8a62b: fix deployment error caused by alarm names

## 0.1.2

### Patch Changes

- c697c86: incorporate new observability lib
- c697c86: add mvp implementation of render-html endpoint
- c697c86: add authorization to /render/html endpoint
- Updated dependencies [c697c86]
- Updated dependencies [c697c86]
  - @twin-digital/bookify@0.3.0
  - @twin-digital/observability-lib@0.0.1

## 0.1.1

### Patch Changes

- 9d06270: incorporate new development workflow
- c6c2536: initial creation of package
  - @twin-digital/bookify@0.2.1
