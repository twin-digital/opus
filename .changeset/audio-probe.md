---
'@thrashplay/music': patch
---

Add music-audio-probe, a standalone diagnostic for the timed audio death under
investigation in #254: it opens an output stream with no MIDI or samples
involved, beeps through it every five seconds, and prints the stream's clock
rate, state, and render load — so the failure can be heard and measured at the
same moment. A second stream joins at 100 seconds and alternates beeps with
the first, answering whether a fresh stream survives the first one's death.
