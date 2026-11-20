---
'@twin-digital/repo-kit': patch
---

List workspace packages in a stable, path-sorted order with normalized paths, so `update-readme` and `sync` produce the same output regardless of the order `pnpm list` emits (which differs between pnpm 11 and 12).
