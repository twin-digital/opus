# @twin-digital/observability-lib

## 0.0.2

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
  - @twin-digital/logger-lib@0.0.1

## 0.0.1

### Patch Changes

- c697c86: initial creation of package
- Updated dependencies [c697c86]
  - @twin-digital/logger-lib@0.0.1
