# @twin-digital/serverless-dev-tools

## 0.1.4

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
- b3c1047: Extensible, DRY tsdown bundle config. The shared base config + the
  per-package-override composition now live in a new `@twin-digital/tsdown-config`
  package (`base` + `defineBundleConfig`), and the repo-kit `bundle` feature emits
  a tiny `tsdown.config.ts` that just calls it. Packages diverge from the defaults
  by dropping a `tsdown.config.d/*.ts` partial (shallow-merged over the base),
  mirroring the `eslint.config.d/` / `vite.config.d/` pattern — no more inlined
  merge logic duplicated into every package.

## 0.1.3

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.

## 0.1.2

### Patch Changes

- c697c86: fix gateway error preventing binary payloads from passing to lambdas

## 0.1.1

### Patch Changes

- 9d06270: initial creation of project
