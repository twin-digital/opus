# @grinbox/web

## 0.1.0

### Minor Changes

- 18b1bba: Port grinbox's daemon into the workspace and fix the eight defects the capture audit found, including a digest that dropped covered mail and seeded caps a user could remove. The daemon builds a deployable bundle for its release, which the deployment fetches by version.
- 18b1bba: Port grinbox's browser application into the workspace. It types its API client from the daemon's own routes, bundles its fonts so it renders without egress, and no longer offers a mail-backend deep link.

### Patch Changes

- Updated dependencies [18b1bba]
- Updated dependencies [18b1bba]
- Updated dependencies [8f9cd10]
  - @grinbox/server@0.1.0
  - @grinbox/shared@0.1.0
