---
'@twin-digital/mc-pack-config': minor
---

New package: the shared tsdown config for Bedrock behavior packs, applied to each pack by repo-kit's `bedrock-pack` feature — bundles `src/main.ts` to `dist/scripts/main.js`, keeps `@minecraft/*` external, and assembles the shippable manifest (version from `package.json`) into `dist/`.
