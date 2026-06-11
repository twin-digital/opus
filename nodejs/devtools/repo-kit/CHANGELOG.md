# @twin-digital/repo-kit

## 0.3.2

### Patch Changes

- 060e675: fix(deps): update dependency commander to v15. Commander 15 is ESM-only and requires Node.js ≥ 22.12.0; repo-kit is already ESM on Node 24 and uses no negated (`--no-*`) options, so the v15 breaking changes don't affect it.
  - @twin-digital/json-patch-x@0.3.0

## 0.3.1

### Patch Changes

- aae566b: ci: split Renovate updates for pnpm-patched packages (`patchedDependencies`) into their own labeled, non-auto-merged PRs. A version-pinned pnpm patch stops applying on any bump and breaks the lockfile relock, so each patched dependency is isolated for a human to re-roll or drop the patch under review (mirrors the `onlyBuiltDependencies` build-script isolation). The renovate.json rule's `matchPackageNames` is kept in sync with `pnpm-workspace.yaml` by repo-kit so the two cannot drift.

  repo-kit gains a generic `sync-map-to-array` action (map → array via `emit: keys | values`, with an optional curated, array-level `transform` such as `strip-package-version`), built on read/write plumbing factored out of `sync-json-value`.

## 0.3.0

### Minor Changes

- 4858d9f: Add feature `scope` and a cross-file `sync-json-value` action.
  - Features may now declare `scope: packages | root | all` (default `packages`). `sync` now also processes the workspace root, and a feature runs against a project only when its scope applies — so root-level config can be managed without per-package opt-outs, and existing package features (which default to `packages`) never touch the root.
  - The `sync-json-value` action copies a value out of one JSON/YAML file into the element(s) of an array in a target JSON file, selected by a value predicate (via `setMatching`) rather than a brittle index. It is idempotent.
  - `sync` now exits non-zero when a feature fails. Failures were already logged but the process exited 0, so a broken sync could pass the merge-checks gate. Failures are aggregated across the whole sweep — every package is still attempted before the non-zero exit — and the continue-on-error behavior is unchanged.

### Patch Changes

- 4858d9f: The `repo-kit` bin is now a small launcher that runs from TypeScript source when the package's `src` is present (in a checkout of this repo) and from the compiled `dist` when installed as a published package. Commands are also registered from an explicit list rather than a runtime scan of the `commands/` directory, so resolution is identical from source or `dist`. The published CLI behaves exactly as before.
- Updated dependencies [4858d9f]
  - @twin-digital/json-patch-x@0.3.0

## 0.2.2

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
- b80fa6c: Internal cleanup: remove dead modules orphaned by earlier refactors (the per-package `configuration/` loaders, `config/assets.ts`, `getCurrentPackage`, and `canonicalizeJson`), add a unit-test suite covering the actions, conditions, rule factory, and markdown/JSON utilities, and add a package README. Also corrects the `SyncActionConfig`/`FeatureConfigItem` doc comments to state that multiple conditions are combined with logical AND (matching the long-standing behavior). No runtime behavior changes.
  - @twin-digital/json-patch-x@0.2.0

## 0.2.1

### Patch Changes

- c6c2536: correctly identify JSON files with reordered keys as changed
- Updated dependencies [c6c2536]
  - @twin-digital/json-patch-x@0.2.0

## 0.2.0

### Minor Changes

- 22f58e3: update to nodejs v24.x and Typescript 5.9

### Patch Changes

- Updated dependencies [22f58e3]
  - @twin-digital/json-patch-x@0.1.0

## 0.1.1

### Patch Changes

- b5fa9b9: add support for hooks to run after file changes
- 700cee0: add support for "dependency" condition
  - @twin-digital/json-patch-x@0.0.1

## 0.1.0

### Minor Changes

- 3d5a613: change design so that feature config is provided by users

  Previously, there was one set of opinionated features baked into the library. Now,
  the repo must include a '.repo-kit.yml' file (with configurable path). This YAML
  file specifies the sets of features, and also which packages they apply to.

### Patch Changes

- 22d6324: update 'align-config' to correctly exclude declaration maps from packages
- 40500d6: format package.json via prettier-package-json when it is changed
- c7ec681: add 'typescript' configuration to sync command
- bf36ec4: add configuration option to disable 'eslintBootstrap' sync task
- a9b6381: fix align-config error when updating non-existing files and improved logs
- e8d4089: add support for sync plugins which require reinstalling npm dependencies
- Updated dependencies [f361b78]
- Updated dependencies [f830568]
  - @twin-digital/json-patch-x@0.0.1

## 0.0.3

### Patch Changes

- 5faa81c: update 'align-config' command to remove tsbuildinfo from excluded files
- e90007f: add initial version of 'align-config' command
- 2185ca5: update 'align-config' to only add exports for files that exist
- 40d53e5: update 'align-config' to only add dist entries to package.json files if there is a "src" folder

## 0.0.2

### Patch Changes

- 28fc4a8: fix crash when running via npx

## 0.0.1

### Patch Changes

- 8d4b8b0: publish initial version of tool
- d2f6064: add 'update-readme' command
