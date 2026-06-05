---
'@twin-digital/repo-kit': patch
---

ci: split Renovate updates for pnpm-patched packages (`patchedDependencies`) into their own labeled, non-auto-merged PRs. A version-pinned patch stops applying on any bump and breaks the lockfile relock, so each patched dependency is isolated for a human to re-roll or drop the patch under review (mirrors the `onlyBuiltDependencies` build-script isolation). repo-kit's `sync-json-value` action gains `keys` / `stripVersion` source options to derive the package names from the `patchedDependencies` map, keeping `renovate.json` in sync with `pnpm-workspace.yaml` so the two cannot drift.
