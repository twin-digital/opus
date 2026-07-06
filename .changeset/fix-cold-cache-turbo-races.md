---
'@twin-digital/eslint-config': patch
---

fix: stop cold-cache turbo lint/typecheck races

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
