# @twin-digital/tsconfig

## 0.3.0

### Minor Changes

- 4d674ac: Add first-class Vite support to the shared config. `@twin-digital/tsconfig` gains
  `tsconfig.vite.json` (browser/bundler-mode: module preserve, bundler resolution, DOM libs,
  vite/client types), and the repo-kit `vite` feature — keyed on the `vite` dependency — generates a
  tsconfig extending it, the `dev`/`preview` scripts, and a `vite.config.ts` fragment loader:
  per-app settings live in `vite.config.d/*.js` (the same override pattern as `eslint.config.d`),
  with the source-first `resolve.conditions` baked into the base. launchpad-sim migrates onto the
  generated config.

## 0.2.1

### Patch Changes

- e95e6a5: Support TypeScript 6. Drop the deprecated `downlevelIteration` compiler option from the shared tsconfig (a no-op at the configured ES2024 target, and an error under TS 6), and type the refbash store's items map as `ObservableMap` so it satisfies TS 6's updated `Map` lib definitions (`getOrInsert`/`getOrInsertComputed`).

## 0.2.0

### Minor Changes

- 22f58e3: update tsconfig to include everything for linting & specific build override
- 22f58e3: update to nodejs v24.x and Typescript 5.9

### Patch Changes

- 22f58e3: change library to ESNext

  This grants support for the new Iterable helpers.

- 8d56808: update configuration to support jsx

## 0.1.1

### Patch Changes

- b5fa9b9: initial publish of package from new repository

## 0.1.0

### Minor Changes

- 0120313: update config to abandon use of project references:
  - remove composite flag
  - add 'noEmit' flag
  - remove 'tsBuildInfoFile' option

- cb9da5d: update build options to emit declarations and declaration maps

### Patch Changes

- 9122192: fix: correctly include tsconfig files in published package
- 2671ba3: add 'preserveWatchOutput' option
