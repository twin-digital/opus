---
'@twin-digital/repo-kit': patch
---

Internal cleanup: remove dead modules orphaned by earlier refactors (the per-package `configuration/` loaders, `config/assets.ts`, `getCurrentPackage`, and `canonicalizeJson`), add a unit-test suite covering the actions, conditions, rule factory, and markdown/JSON utilities, and add a package README. Also corrects the `SyncActionConfig`/`FeatureConfigItem` doc comments to state that multiple conditions are combined with logical AND (matching the long-standing behavior). No runtime behavior changes.
