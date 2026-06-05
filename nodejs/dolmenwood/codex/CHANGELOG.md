# @twin-digital/codex

## 0.3.2

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
  - @twin-digital/dolmenwood@0.3.1

## 0.3.1

### Patch Changes

- Updated dependencies [68c283d]
  - @twin-digital/dolmenwood@0.3.1

## 0.3.0

### Minor Changes

- 22f58e3: update to nodejs v24.x and Typescript 5.9

### Patch Changes

- 22f58e3: move core Dolmenwood model into new @twin-digital/dolmenwood package
  - create new package
  - move relevant code from 'codex'
  - update dependencies in refbash

- 8d56808: update project configuration to facilitate exporting a library
- Updated dependencies [22f58e3]
- Updated dependencies [b78823f]
- Updated dependencies [b78823f]
- Updated dependencies [22f58e3]
- Updated dependencies [22f58e3]
- Updated dependencies [22f58e3]
- Updated dependencies [b78823f]
- Updated dependencies [b78823f]
- Updated dependencies [b78823f]
  - @twin-digital/dolmenwood@0.3.0

## 0.2.1

### Patch Changes

- 3539ae3: add 'Mod' column to stat roll results table

## 0.2.0

### Minor Changes

- aadf980: add bot support for input command handling
- aadf980: update stats rolling to be a chat command instead of message-based
- aadf980: add persistent stat rolling and replay of existing stats

## 0.1.0

### Minor Changes

- 50c71be: add dice rolling behavior

## 0.0.4

### Patch Changes

- f5fc836: fix error publishing docker images

## 0.0.3

### Patch Changes

- 965c25d: fix error publishing docker images

## 0.0.2

### Patch Changes

- 3beda66: publish first version of package

## 0.0.1

### Patch Changes

- 700cee0: create initial version of bot
