---
'@thrashplay/music': patch
---

MUSIC_AUDIO_FORCE_GC is removed. It existed to test whether the render graph
grew because V8 deferred collecting the wrappers that pin native nodes — a
theory the investigation on #254 falsified (a single note reproduced the
stall; the cause was degraded machine state cleared by a reboot). The
MUSIC_SAMPLE_RATE documentation also stops attributing the device wedge to
rate mismatch, which the same investigation disproved; the setting remains as
resampling hygiene.
