# @twin-digital/eslint-config

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
