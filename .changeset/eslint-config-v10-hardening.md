---
'@twin-digital/eslint-config': minor
---

Harden the shared config for ESLint v10: require `eslint >= 10` as a peer dependency (the config now ships `@eslint/js@^10` and is authored against v10 semantics), and set `linterOptions.reportUnusedDisableDirectives: "error"` so stale `eslint-disable` annotations fail lint instead of warning silently.
