# @twin-digital/bookify-render-api

## 0.1.10

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
- 6b33da7: fix(deps): update dependency adm-zip to ^0.6.0 [security]
- b3c1047: Extensible, DRY tsdown bundle config. The shared base config + the
  per-package-override composition now live in a new `@twin-digital/tsdown-config`
  package (`base` + `defineBundleConfig`), and the repo-kit `bundle` feature emits
  a tiny `tsdown.config.ts` that just calls it. Packages diverge from the defaults
  by dropping a `tsdown.config.d/*.ts` partial (shallow-merged over the base),
  mirroring the `eslint.config.d/` / `vite.config.d/` pattern — no more inlined
  merge logic duplicated into every package.
- Updated dependencies [da1e483]
  - @twin-digital/bookify@0.4.4
  - @twin-digital/observability-lib@0.0.6

## 0.1.9

### Patch Changes

- Updated dependencies [5a835b6]
- Updated dependencies [bb752c0]
  - @twin-digital/observability-lib@0.0.5
  - @twin-digital/bookify@0.4.3

## 0.1.8

### Patch Changes

- 348c15a: Split the deploy/destroy scripts into tool-typed turbo tasks (`deploy:serverless` / `deploy:cdk`) so CI can deploy each tool to its own account and role. Membership is implicit — `turbo run deploy:serverless` runs only packages defining it, `deploy:cdk` only CDK apps. No change to what is deployed.
- Updated dependencies [d3f7b5f]
  - @twin-digital/observability-lib@0.0.4
  - @twin-digital/bookify@0.4.2

## 0.1.7

### Patch Changes

- 713799c: chore(deps): drop the explicit `vite` devDependency from bookify-render-api. Vite is a peer of vitest and is auto-installed by pnpm (as it already is for every other vitest-using package), so the manual declaration was redundant. This also retires the standalone Renovate update for it.
- Updated dependencies [6a71063]
- Updated dependencies [16681f3]
- Updated dependencies [729a6a6]
  - @twin-digital/bookify@0.4.2
  - @twin-digital/observability-lib@0.0.3

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
