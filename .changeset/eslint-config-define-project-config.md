---
'@twin-digital/eslint-config': minor
---

Add `defineProjectConfig(import.meta.url)`, which composes the shared config with a package's `eslint.config.d/*.js` overrides so the managed `eslint.config.js` is a one-line call.
