---
---

chore: run `pnpm format:check` in the pre-commit hook.

PR #145 added a repo-wide Prettier gate (`format:check`) to CI's `merge-checks`, but the local pre-commit hook only runs `pnpm lint` (per-package Prettier + eslint) and `pnpm typecheck`. Root-level, non-package files — `.changeset/*.md`, top-level `docs/`, root YAML — aren't covered by any package's lint, so they could be committed unformatted and only fail in CI. The hook now runs `pnpm format:check` first, mirroring the CI gate locally so the failure surfaces before the push.
