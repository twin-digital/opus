---
---

Minecraft behavior-pack dev/release plumbing (no package code): the dev Bedrock server deploys packs via `docker compose watch` (sync + `/reload`, activation sync + restart), the publish workflow attaches `.mcpack` artifacts to pack releases, and turbo build inputs now cover `tsdown.config.d/` and `pack/`.
