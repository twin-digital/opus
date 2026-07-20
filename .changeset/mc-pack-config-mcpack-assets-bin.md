---
'@twin-digital/mc-pack-config': minor
---

Add the `mcpack-assets` bin: zips a pack's built `dist/` into `.release-assets/<name>-<version>.mcpack` (manifest at the archive root). Wired into every pack as its `release-assets` script by repo-kit's `bedrock-pack` feature.
