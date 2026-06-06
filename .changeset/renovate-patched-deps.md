---
'@twin-digital/repo-kit': patch
---

ci: split Renovate updates for pnpm-patched packages (`patchedDependencies`) into their own labeled, non-auto-merged PRs. A version-pinned pnpm patch stops applying on any bump and breaks the lockfile relock, so each patched dependency is isolated for a human to re-roll or drop the patch under review (mirrors the `onlyBuiltDependencies` build-script isolation). The renovate.json rule's `matchPackageNames` is kept in sync with `pnpm-workspace.yaml` by repo-kit so the two cannot drift.

repo-kit gains a generic `sync-map-to-array` action (map → array via `emit: keys | values`, with an optional curated, array-level `transform` such as `strip-package-version`), built on read/write plumbing factored out of `sync-json-value`.
