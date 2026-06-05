---
'@twin-digital/json-patch-x': minor
---

Add a `setMatching` extended operation: select array element(s) by a value predicate (`contains`/`equals` against a field pointer) and set a child pointer within each match. This addresses array elements by value rather than by index — the gap left by RFC 6901 JSON Pointers — so selection is stable across reordering. Also exports `tryGetValueByPointer` from the package entry point, and bootstraps the package's first vitest test suite.
