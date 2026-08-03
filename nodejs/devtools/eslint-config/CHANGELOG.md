# @twin-digital/eslint-config

## 0.5.0

### Minor Changes

- da1e483: Add `defineProjectConfig(import.meta.url)`, which composes the shared config with a package's `eslint.config.d/*.js` overrides so the managed `eslint.config.js` is a one-line call.

## 0.4.1

### Patch Changes

- ffcc385: fix: stop cold-cache turbo lint/typecheck races

  Failures that only surface on a cold turbo cache (e.g. a fresh worktree),
  where every task actually executes instead of replaying cached results:

  - Ignore `coverage/` in the shared eslint config. When `lint` and `test`
    run concurrently, eslint walked into the coverage directory vitest was
    mid-writing and crashed with `ENOENT: scandir 'coverage'`. It should never
    lint generated coverage output anyway.
  - Make the two devcontainer packages whose `bin/*.js` imports from their own
    `./dist` (`credential-shelf`, `credential-shelf-trigger`) depend on their
    build before lint/typecheck. The type-aware eslint rules and tsc resolve
    that import, so running before the build failed with `no-unsafe-call` /
    `Cannot find module`. Scoped per-package in turbo.json so nothing else
    gains an unnecessary build dependency.

## 0.4.0

### Minor Changes

- d3f7b5f: Relax the type-aware "unsafe any" rules for eslint config files (`eslint.config.*`) and `eslint.config.d/*` fragments, which are untyped tooling glue (dynamic imports, spreads of the shared base array).

## 0.3.0

### Minor Changes

- 6a71063: Harden the shared config for ESLint v10: require `eslint >= 10` as a peer dependency (the config now ships `@eslint/js@^10` and is authored against v10 semantics), and set `linterOptions.reportUnusedDisableDirectives: "error"` so stale `eslint-disable` annotations fail lint instead of warning silently.
- 6a71063: chore(deps): update eslint monorepo to v10. ESLint v10 drops the legacy eslintrc system and adds three rules to `eslint:recommended` (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`), so consumers of this config will see those enforced.

### Patch Changes

- 953c32f: chore(deps): update dependency globals to v17

## 0.2.0

### Minor Changes

- c697c86: add new rule requiring curly braces for all blocks

### Patch Changes

- c697c86: disable conflicting rules related to non-null assertions
- c697c86: suppress 'forbidden non-null assertion' in test files
- c697c86: disable @typescript-eslint/unbound-method in test files

## 0.1.0

### Minor Changes

- 22f58e3: update to nodejs v24.x and Typescript 5.9

## 0.0.2

### Patch Changes

- bb51809: initial release or project
