---
'@twin-digital/repo-kit': minor
---

Add feature `scope` and a cross-file `sync-json-value` action.

- Features may now declare `scope: packages | root | all` (default `packages`). `sync` now also processes the workspace root, and a feature runs against a project only when its scope applies — so root-level config can be managed without per-package opt-outs, and existing package features (which default to `packages`) never touch the root.
- The `sync-json-value` action copies a value out of one JSON/YAML file into the element(s) of an array in a target JSON file, selected by a value predicate (via `setMatching`) rather than a brittle index. It is idempotent.
- `sync` now exits non-zero when a feature fails. Failures were already logged but the process exited 0, so a broken sync could pass the merge-checks gate. Failures are aggregated across the whole sweep — every package is still attempted before the non-zero exit — and the continue-on-error behavior is unchanged.
