---
'@twin-digital/renovate-tools': patch
---

Add `@twin-digital/renovate-tools`: generates one managed changeset per Renovate PR by diffing each workspace package's effective published dependency ranges (manifest + hand-rolled `catalog:` resolution), with peer cross-major escalation and a fail-open errored path. See `docs/cicd/renovate-integration.md`.
