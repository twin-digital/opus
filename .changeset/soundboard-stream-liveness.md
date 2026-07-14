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

MUSIC_AUDIO_DEBUG=1 turns on audio diagnostics: the render thread reports its
own load and underrun ratio once a second, and a health line (context state,
clock, live voices, heap and native memory) prints every five — so a failing
stream can be watched degrading instead of only found dead. MUSIC_AUDIO_FORCE_GC=1
(with node --expose-gc) additionally forces a collection pass on every health
tick, to test whether the render graph grows only because V8 defers collecting
the small wrapper objects that pin native nodes.
