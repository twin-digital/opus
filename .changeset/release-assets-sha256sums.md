---
---

The publish workflow's release-assets job attaches a `SHA256SUMS` file (sha256sum format) alongside each release's assets, so plain-URL consumers can verify downloads without querying the GitHub API. No package code changes.
