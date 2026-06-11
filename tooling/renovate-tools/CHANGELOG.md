# @twin-digital/renovate-tools

## 0.0.2

### Patch Changes

- 6a71063: chore: satisfy new `eslint:recommended` rules introduced in ESLint v10. The pandoc/WeasyPrint "not installed" errors now attach the underlying spawn failure as `cause` (`preserve-caught-error`), and a redundant `let isDir = false` initializer in the workspace walker was dropped (`no-useless-assignment`).

## 0.0.1

### Patch Changes

- 6d3f845: Add `@twin-digital/renovate-tools`: generates one managed changeset per Renovate PR by diffing each workspace package's effective published dependency ranges (manifest + hand-rolled `catalog:` resolution), with peer cross-major escalation and a fail-open errored path. See `docs/cicd/renovate-integration.md`.
