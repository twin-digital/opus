---
'@thrashplay/music': patch
---

The audio output stream opens at MUSIC_SAMPLE_RATE, defaulting to 44100. The
rate matters far beyond audio quality: a stream whose rate disagrees with the
output device's drifts against it, and on at least the FP-30X's USB audio
interface the reconciliation ~90 seconds in wedges the device for every
process using it. The default is that device's native rate; set the variable
to match whatever the samples play through.
