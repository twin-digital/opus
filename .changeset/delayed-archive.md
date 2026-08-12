---
'@grinbox/shared': minor
'@grinbox/server': minor
'@grinbox/web': minor
---

The archive action takes an optional delay: a triage records a pending archive due that many
seconds past the message's take-in, and grinbox performs it when it comes due. A message's read
surfaces carry the standing pending archive, so what a re-triage would cancel is visible before it
fires.

The poll, digest, and pending-archive schedulers now wake on one heartbeat. The deployment sets it
with `GRINBOX_HEARTBEAT_SECONDS`; `GRINBOX_POLL_SCHEDULER_TICK_SECONDS` and
`GRINBOX_DIGEST_SCHEDULER_TICK_SECONDS` are no longer read.
