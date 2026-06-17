---
'@twin-digital/eslint-config': minor
---

Relax the type-aware "unsafe any" rules for eslint config files (`eslint.config.*`) and `eslint.config.d/*` fragments, which are untyped tooling glue (dynamic imports, spreads of the shared base array).
