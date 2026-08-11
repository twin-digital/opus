# @grinbox/server

## 0.3.0

### Minor Changes

- 34b3626: Notification kinds and cooldowns, the digest's second rendition, and money in display form (grinbox 009).

  - A notify operator may name a notification kind; the user sets a per-kind minimum interval
    (whole seconds) from the new cooldown settings surface, and a push inside the interval is
    suppressed — recorded as its own `resource_op_suppressed` outcome naming the push it
    deferred to, resolvable across messages. Cooldown changes write the change log.
  - A digest is delivered as one mail in two renditions: the plain text as before, plus a
    self-contained rich rendition (escaped throughout, translucent colouring only, threshold
    marks styled rather than suffixed). The send operation takes the optional rich rendition;
    a backend without alternatives sends plain text alone.
  - Extracted money values render in display form — `$195.03`, `CHF 1,234.56` — in digests and
    everywhere the interface shows a money-typed tag, from one shared formatter; stored values
    and threshold inputs stay in the normalized form.

### Patch Changes

- Updated dependencies [34b3626]
  - @grinbox/shared@0.3.0

## 0.2.2

### Patch Changes

- aa1c6a8: fix(deps): update all non-major dependencies
- e903659: fix(deps): update dependency googleapis to v173
  - @grinbox/shared@0.2.2

## 0.2.1

### Patch Changes

- 633a769: fix(deps): update dependency croner to v10
  - @grinbox/shared@0.2.1

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
