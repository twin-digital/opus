# @grinbox/server

## 0.2.0

### Minor Changes

- 9418bfe: Double the seeded cap on model calls to 100 per ten minutes, and bring the startup reconcile into line with it: a seeded cap whose bound this release has changed now moves to the shipped value instead of keeping whatever was first written. The user's own caps are a different origin and are untouched.

### Patch Changes

- Updated dependencies [9418bfe]
  - @grinbox/shared@0.2.0

## 0.1.0

### Minor Changes

- 18b1bba: Port grinbox's daemon into the workspace and fix the eight defects the capture audit found, including a digest that dropped covered mail and seeded caps a user could remove. The daemon builds a deployable bundle for its release, which the deployment fetches by version.

### Patch Changes

- 8f9cd10: fix(deps): update dependency @hono/node-server to v2 [security]
- Updated dependencies [18b1bba]
- Updated dependencies [18b1bba]
  - @grinbox/shared@0.1.0
