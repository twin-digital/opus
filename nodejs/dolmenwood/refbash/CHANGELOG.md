# @twin-digital/refbash

## 0.1.6

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
- Updated dependencies [da1e483]
  - @twin-digital/dolmenwood@0.3.2

## 0.1.5

### Patch Changes

- bb752c0: fix(deps): update dependency meow to v14
- 05ba4db: fix(deps): update dependency ink to v7
  - @twin-digital/dolmenwood@0.3.1

## 0.1.4

### Patch Changes

- e95e6a5: Support TypeScript 6. Drop the deprecated `downlevelIteration` compiler option from the shared tsconfig (a no-op at the configured ES2024 target, and an error under TS 6), and type the refbash store's items map as `ObservableMap` so it satisfies TS 6's updated `Map` lib definitions (`getOrInsert`/`getOrInsertComputed`).
  - @twin-digital/dolmenwood@0.3.1

## 0.1.3

### Patch Changes

- e12d84e: fix(deps): update `@mishieck/ink-titled-box` to `^0.4.0` and drop the obsolete local patch. The patch (pinned to `0.3.0`) backported two React hook-dependency fixes that upstream now ships in 0.4.x, so it is removed rather than re-rolled. ink-titled-box consequently leaves the Renovate `patched-deps` isolation rule (synced by repo-kit). Supersedes #139, which couldn't reconcile the version-pinned patch on a bump.

## 0.1.2

### Patch Changes

- 68e432d: Single-source previously-drifting shared dependencies through the pnpm catalog. `dotenv`, `chalk`, `ts-node`, `tsdown`, `execa`, `yaml`, and the `@aws-sdk/*` clients (`client-s3` and `client-bedrock-runtime`, kept in lockstep with the existing DynamoDB clients at `^3.958.0`) are now defined once in the workspace catalog, and `@types/aws-lambda` now resolves via the catalog in the packages that had pinned it directly. No API changes.
  - @twin-digital/dolmenwood@0.3.1

## 0.1.1

### Patch Changes

- 68c283d: prune lights and encounter when decrementing time
- Updated dependencies [68c283d]
  - @twin-digital/dolmenwood@0.3.1

## 0.1.0

### Minor Changes

- b78823f: implement "Encounter" panel
  - Wizard-like flow for resolving start-of-encounter steps
  - Only asks relevant questions and infers results when possible
  - Determines encounter distance, surprise, and encounter initiative

- 22f58e3: implement common 3-section layout for all modes
- 22f58e3: implement light source tracking during delves
  - Each light source shows who is carrying it, type, and remaining turns
  - As time advances, light durations automatically decrement
  - Lights are highlighted when they near expiration (yellow) or have expired (red)
  - EventLog entries are created when a light goes out
  - Lights can be added via simple form, or removed

- b78823f: revamp input system to support layering
- b78823f: introduce new footer content pattern

  This will allow deeply nested components to "take control" of the footer and
  render contextual content, such as forms, into it.

- 22f58e3: rename project from 'refbash'
- 22f58e3: update to nodejs v24.x and Typescript 5.9
- 22f58e3: integrate mobx for observability and persistence

### Patch Changes

- 22f58e3: move core Dolmenwood model into new @twin-digital/dolmenwood package
  - create new package
  - move relevant code from 'codex'
  - update dependencies in refbash

- b78823f: do not advance turn if user enters 't' in form field
- b78823f: update CompactTable component to support row selection
- b78823f: update compact-table to support per-row styling
- 8d56808: create initial project skeleton
- b78823f: support nested model classes in abstract store

  Previously, nested class instances would not be made 'observable', preventing reactive
  updates when nested data changed. The new `_initializeObservable` implementation
  recursively traverses the object graph, making deep observables.

- b78823f: update warning colors to be more distinct from Autumn Orange
- b78823f: add support for wandering monsters to delve automation
  - Delve configuration includes check frequency and wandering monster chance
  - As time advances, wandering monster checks are automatically performed based on the configuration
  - Pressing 'w' will perform an ad-hoc wandering monster check in the current turn
  - If the check indicates a wandering monster appears, an encounter is created in the turn

- b78823f: enhance display of event log
  - prefix with in-game time
  - correctly update panel when log contents change
  - support 'rewinding' the time and clearing later log entries
  - allow selection of log entries, to facilitate viewing logs longer than screen height

- b78823f: implement log panel scrolling
- b78823f: add 'selected' colors to theme
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
