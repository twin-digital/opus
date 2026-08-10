---
'@grinbox/server': minor
'@grinbox/shared': minor
'@grinbox/web': minor
---

Port grinbox's daemon into the workspace and fix the eight defects the capture audit found, including a digest that dropped covered mail and seeded caps a user could remove. The daemon builds a deployable bundle for its release, which the deployment fetches by version.
