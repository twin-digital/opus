---
'@thrashplay/music': patch
---

Detect a wedged audio stream by its clock, not just its state. A stream whose
device has stopped invoking its render callbacks renders nothing and freezes
its clock, but its state can still read 'running' — state is control-side
bookkeeping, not device truth — so the stall detection added in 0.3.1 never saw
it. When wall time advances and the context's currentTime does not keep pace,
the stream is discarded and the next note opens a fresh one, the same recovery
path a non-running state takes.
