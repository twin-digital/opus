# @grinbox/shared

## 0.1.0

### Minor Changes

- 18b1bba: Port grinbox's daemon into the workspace and fix the eight defects the capture audit found, including a digest that dropped covered mail and seeded caps a user could remove. The daemon builds a deployable bundle for its release, which the deployment fetches by version.
- 18b1bba: Port grinbox's shared contracts into the workspace. The package declares the value vocabulary both tiers speak — the closed enums, the operator configuration schemas, the contract derivation, the resource and limit registries, and the match and template grammars.
