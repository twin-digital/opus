---
'@twin-digital/mc-dev-kit': patch
---

Correct the `packBuild` doc example's package directory: from a file in `tsdown.config.d/`,
`new URL('../..', import.meta.url)` resolves to the filesystem root, not the package. It is `'..'`.
