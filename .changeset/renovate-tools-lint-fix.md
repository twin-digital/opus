---
---

chore(renovate-tools): drop two redundant `as Manifest` casts in the ranges test. A newer `typescript-eslint` (incoming via the all-non-major Renovate batch) correctly flags them as unnecessary type assertions; the object literals are already valid `Manifest`s. Test-only, no published behavior change.
