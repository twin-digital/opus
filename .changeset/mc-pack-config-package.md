---
'@twin-digital/mc-pack-config': minor
---

New package: the shared tsdown config for Bedrock behavior packs, dropped into each pack's `tsdown.config.d/` by repo-kit's `bedrock-pack` feature. Bundles `src/main.ts` to `dist/scripts/main.js`, declares `@minecraft/*` external (the game runtime provides them), and assembles the shippable manifest into `dist/` with the version injected from `package.json` — so `dist/` is always a complete, installable pack.
