---
'@twin-digital/repo-kit': minor
---

The `sync-json-value` action can now write to a single object field addressed by a JSON Pointer (`target: { file, pointer }`), in addition to the existing predicate-selected array element, and accepts an optional named `transform` applied to the value. Adds a `strip-scope` transform that reduces a scoped package name to its bare name.
