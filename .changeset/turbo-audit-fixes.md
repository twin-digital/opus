---
---

chore: turbo task-graph cache-correctness and performance fixes (no package code changed)

- Add `globalDependencies` for the shared base `tsconfig` files and root `.prettierrc`/`.prettierignore`, which affect `build`/`typecheck`/`lint` output but were not hashed — editing them previously served stale cached results.
- Point `lint`, `lint:fix`, and `typecheck` at the `upstream-sources` transit node instead of `^build`. In the source-first setup these resolve dependencies from `src`, so they no longer trigger a full dependency-graph build (only the `eslint-config` toolchain that `lint` loads at runtime).
- Raise `concurrency` 5 → 10, give `test` explicit `inputs`, and mark `lint:fix` `cache: false`.
