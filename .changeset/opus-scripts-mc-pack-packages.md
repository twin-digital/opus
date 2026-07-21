---
'@twin-digital/opus-scripts': minor
---

Add `release-asset-packages`, which detects packages released at HEAD (from git tags) that expose a `release-assets` script, and emits a JSON matrix for the publish workflow's release-asset job.
