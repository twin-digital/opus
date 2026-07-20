---
---

The Minecraft dev server deploys packs via `docker compose watch`: a pack's built `dist/` syncs into the container followed by `/reload`, and activation-list changes (`generate-activation.mjs`) sync into the world followed by a restart. No package code changes.
