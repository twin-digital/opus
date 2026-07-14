---
'@thrashplay/music': patch
---

music-audio-probe accepts stream configuration overrides, for isolating a
sample-rate or buffering mismatch with the output device: PROBE_SAMPLE_RATE
opens the stream at an explicit rate and PROBE_LATENCY takes 'interactive',
'balanced', 'playback', or a number of seconds. The requested configuration is
printed before the stream opens, and the resulting rate after.
