---
'@thrashplay/music': patch
---

music-audio-probe gains a second audio backend: PROBE_BACKEND=rtaudio drives
the beeps through audify's RtAudio bindings — an independent CoreAudio path
sharing no code with the cpal backend under node-web-audio-api. If the rtaudio
backend survives where the webaudio backend dies at ~90 seconds, the fault is
in cpal's layer and RtAudio is a viable escape hatch for sample playback; if
both die alike, the fault is below every library. The rtaudio backend also
prints the device's preferred and supported sample rates as RtAudio sees them.
