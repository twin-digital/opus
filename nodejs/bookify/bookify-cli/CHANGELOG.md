# @twin-digital/bookify-cli

## 0.4.4

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
- b3c1047: Extensible, DRY tsdown bundle config. The shared base config + the
  per-package-override composition now live in a new `@twin-digital/tsdown-config`
  package (`base` + `defineBundleConfig`), and the repo-kit `bundle` feature emits
  a tiny `tsdown.config.ts` that just calls it. Packages diverge from the defaults
  by dropping a `tsdown.config.d/*.ts` partial (shallow-merged over the base),
  mirroring the `eslint.config.d/` / `vite.config.d/` pattern — no more inlined
  merge logic duplicated into every package.
- Updated dependencies [da1e483]
  - @twin-digital/bookify@0.4.4
  - @twin-digital/cli-lib@0.0.2

## 0.4.3

### Patch Changes

- Updated dependencies [bb752c0]
  - @twin-digital/bookify@0.4.3
  - @twin-digital/cli-lib@0.0.1

## 0.4.2

### Patch Changes

- Updated dependencies [6a71063]
- Updated dependencies [16681f3]
  - @twin-digital/bookify@0.4.2
  - @twin-digital/cli-lib@0.0.1

## 0.4.1

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
- Updated dependencies [68e432d]
  - @twin-digital/bookify@0.4.1
  - @twin-digital/cli-lib@0.0.1

## 0.4.0

### Minor Changes

- 1b55066: add support for pdf rendering with weasyprint

### Patch Changes

- Updated dependencies [1b55066]
  - @twin-digital/bookify@0.4.0

## 0.3.2

### Patch Changes

- Updated dependencies [c697c86]
- Updated dependencies [c697c86]
  - @twin-digital/cli-lib@0.0.1
  - @twin-digital/bookify@0.3.0

## 0.3.1

### Patch Changes

- 3ea389f: replace esbuild with postcss
- Updated dependencies [3ea389f]
  - @twin-digital/bookify@0.2.1

## 0.3.0

### Minor Changes

- 1a694f5: add 'serve' command for hosting and hot-reloading rendered outputs

### Patch Changes

- Updated dependencies [1a694f5]
  - @twin-digital/bookify@0.2.0

## 0.2.1

### Patch Changes

- f8705dc: resolve paths relative to a project file if using one
- Updated dependencies [f8705dc]
  - @twin-digital/bookify@0.1.1

## 0.2.0

### Minor Changes

- 8401a71: add support for reusing CSS published as 'style pack' packages to npm
- 8401a71: bookify: replace loose render functions with a unified engine
  - operates on a project model
  - handles 'watch' functionality internally
  - normalizes configuration of options for renderers via env variables
  - update CLI to use new API

  BREAKING: all previous commands removed from CLI, and replaced with 'html' and 'pdf'

### Patch Changes

- 8401a71: 'pdf' and 'html' commands automatically create output directories if needed
- 8401a71: add '--project' argument to html and pdf commands
- Updated dependencies [8401a71]
- Updated dependencies [8401a71]
- Updated dependencies [8401a71]
  - @twin-digital/bookify@0.1.0

## 0.1.1

### Patch Changes

- 644c2fb: make package publishable
- Updated dependencies [644c2fb]
  - @twin-digital/bookify@0.0.2

## 0.1.0

### Minor Changes

- a163e66: add initial commands:
  - assemble: assembles loose content sections into a single markdown fil
  - transform: assembles markdown input files and transforms them to a single HTML file with assets embedded
  - render: transforms a standalone HTML file (with embedded styles) into a PDF

### Patch Changes

- a163e66: initial creation of project
- Updated dependencies [a163e66]
  - @twin-digital/bookify@0.0.1
