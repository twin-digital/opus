---
'@twin-digital/design-process': minor
---

Enforce the facts/evidence bar in `design-process check`.

`check` now validates the repo-wide `facts/` and `evidence/` pools: entry and wrapper shape against the pool schemas, the backing's source floor, per-source locators and verbatim quotes (in-repo urls and run outputs read from the tree), run-source resolution, `artifacts/` sources backing only tested facts, `superseded_by` resolution, and id uniqueness across the shared fact/run namespace. The loader accepts both the current bare sequences and the later `{version, facts|runs: [...]}` wrappers.
