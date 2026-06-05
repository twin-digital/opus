# @twin-digital/serverless-dev-tools

## 0.1.3

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.

## 0.1.2

### Patch Changes

- c697c86: fix gateway error preventing binary payloads from passing to lambdas

## 0.1.1

### Patch Changes

- 9d06270: initial creation of project
