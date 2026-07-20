---
'@twin-digital/eslint-config': minor
'@twin-digital/vite-config': minor
---

Extract the eslint and vite override-composition into their config packages, the
same DRY pattern as `@twin-digital/tsdown-config`. `@twin-digital/eslint-config`
gains `defineProjectConfig(import.meta.url)` (base + `eslint.config.d/*.js`), and
a new `@twin-digital/vite-config` provides `base` + `defineAppConfig` (base +
`vite.config.d/*.js` via `mergeConfig`). The repo-kit `eslint`/`vite` features now
emit a tiny config that just imports and calls these, so the compose logic lives
in one typed place instead of being inlined into every package.
