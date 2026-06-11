# @twin-digital/opus-scripts

## 0.3.2

### Patch Changes

- 4ab24c0: `artifact` and `docker-dev` now fail fast with a pointer to #164 when no Docker daemon is reachable (the workspace devcontainer no longer mounts the host Docker socket).

## 0.3.1

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.

## 0.3.0

### Minor Changes

- c6c2536: add 'docker-dev' script for iterating on docker containers with 'compose watch'

### Patch Changes

- 9d06270: opus-scripts: update docker-dev to allow reading Compose file from stdin

## 0.2.0

### Minor Changes

- a163e66: add "watch" script for dependency-aware watch

## 0.1.0

### Minor Changes

- 22f58e3: update tsconfig to include everything for linting & specific build override
- 22f58e3: update to nodejs v24.x and Typescript 5.9

### Patch Changes

- 22f58e3: update squash script to push before+after squashing

## 0.0.1

### Patch Changes

- 965c25d: fix error publishing docker images
