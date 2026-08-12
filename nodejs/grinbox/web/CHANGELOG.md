# @grinbox/web

## 0.4.0

### Minor Changes

- cef8d03: The archive action takes an optional delay: a triage records a pending archive due that many
  seconds past the message's take-in, and grinbox performs it when it comes due. A message's read
  surfaces carry the standing pending archive, so what a re-triage would cancel is visible before it
  fires.

  The poll, digest, and pending-archive schedulers now wake on one heartbeat. The deployment sets it
  with `GRINBOX_HEARTBEAT_SECONDS`; `GRINBOX_POLL_SCHEDULER_TICK_SECONDS` and
  `GRINBOX_DIGEST_SCHEDULER_TICK_SECONDS` are no longer read.

### Patch Changes

- Updated dependencies [cef8d03]
  - @grinbox/shared@0.4.0
  - @grinbox/server@0.4.0

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
  - @grinbox/server@0.3.0
  - @grinbox/shared@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [aa1c6a8]
- Updated dependencies [e903659]
  - @grinbox/server@0.2.2
  - @grinbox/shared@0.2.2

## 0.2.1

### Patch Changes

- 876be5d: fix(deps): update dependency sonner to v2
- Updated dependencies [633a769]
  - @grinbox/server@0.2.1
  - @grinbox/shared@0.2.1

## 0.2.0

### Minor Changes

- 9418bfe: Double the seeded cap on model calls to 100 per ten minutes, and bring the startup reconcile into line with it: a seeded cap whose bound this release has changed now moves to the shipped value instead of keeping whatever was first written. The user's own caps are a different origin and are untouched.

### Patch Changes

- Updated dependencies [9418bfe]
  - @grinbox/server@0.2.0
  - @grinbox/shared@0.2.0

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
