---
'@thrashplay/music': patch
---

audify is an optional peer dependency instead of a runtime dependency, so the
default install — including every npx invocation — no longer downloads its
native binding. Only the probe's opt-in rtaudio backend uses it; selecting
PROBE_BACKEND=rtaudio without the package present prints the exact command to
supply it (npx -y -p @thrashplay/music@latest -p audify music-audio-probe).
