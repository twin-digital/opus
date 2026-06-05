# @twin-digital/discord-bot

## 0.1.2

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.

## 0.1.1

### Patch Changes

- 9d06270: incorporate new development workflow

## 0.1.0

### Minor Changes

- 22f58e3: update to nodejs v24.x and Typescript 5.9
