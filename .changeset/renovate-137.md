---
'@twin-digital/repo-kit': patch
---

fix(deps): update dependency commander to v15. Commander 15 is ESM-only and requires Node.js ≥ 22.12.0; repo-kit is already ESM on Node 24 and uses no negated (`--no-*`) options, so the v15 breaking changes don't affect it.
