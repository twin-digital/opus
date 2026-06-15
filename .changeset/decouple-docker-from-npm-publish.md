---
---

ci(publish): build and push Docker images even when `npm publish` fails. The `docker-matrix`/`docker-status-check` jobs no longer require the `publish` job to fully succeed — image builds are gated on their own tag detection (`docker-packages.js` only emits packages tagged at HEAD), so an unrelated npm-publish failure no longer skips them.
