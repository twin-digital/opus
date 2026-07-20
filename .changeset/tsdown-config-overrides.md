---
'@twin-digital/tsdown-config': minor
'@twin-digital/bookify-cli': patch
'@twin-digital/bookify-render-api': patch
'@twin-digital/credential-shelf': patch
'@twin-digital/credential-shelf-trigger': patch
'@twin-digital/serverless-dev-tools': patch
'@twin-digital/codex': patch
---

Extensible, DRY tsdown bundle config. The shared base config + the
per-package-override composition now live in a new `@twin-digital/tsdown-config`
package (`base` + `defineBundleConfig`), and the repo-kit `bundle` feature emits
a tiny `tsdown.config.ts` that just calls it. Packages diverge from the defaults
by dropping a `tsdown.config.d/*.ts` partial (shallow-merged over the base),
mirroring the `eslint.config.d/` / `vite.config.d/` pattern — no more inlined
merge logic duplicated into every package.
