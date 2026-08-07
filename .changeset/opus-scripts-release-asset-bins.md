---
'@twin-digital/opus-scripts': minor
---

Add `release-asset-packages` and `upload-release-assets`, and move the "which packages were released at this commit" detection into a shared `lib/release/released-packages.js` core that `docker-packages` now uses too.
