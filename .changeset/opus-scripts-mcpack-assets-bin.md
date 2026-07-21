---
'@twin-digital/opus-scripts': minor
---

Add the `mcpack-assets` bin: zips a pack's built `dist/` into `.release-assets/<name>-<version>.mcpack` (manifest at the archive root). Wired into every behavior pack as its `release-assets` script by repo-kit's `bedrock-pack` feature.
