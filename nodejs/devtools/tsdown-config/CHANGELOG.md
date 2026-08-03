# @twin-digital/tsdown-config

## 0.2.0

### Minor Changes

- b3c1047: Extensible, DRY tsdown bundle config. The shared base config + the
  per-package-override composition now live in a new `@twin-digital/tsdown-config`
  package (`base` + `defineBundleConfig`), and the repo-kit `bundle` feature emits
  a tiny `tsdown.config.ts` that just calls it. Packages diverge from the defaults
  by dropping a `tsdown.config.d/*.ts` partial (shallow-merged over the base),
  mirroring the `eslint.config.d/` / `vite.config.d/` pattern — no more inlined
  merge logic duplicated into every package.

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.
