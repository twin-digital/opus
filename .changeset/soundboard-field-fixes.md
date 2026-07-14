---
'@thrashplay/music': patch
---

Field fixes from the first hardware session with sound boards.

The sound picker turns the piano's Local Control off while it runs (and restores
it on shutdown), so the keyboard stops sounding its own keys: every key press is
re-voiced through the app — as an echoed program or a sample — and the piano's
factory tone underneath doubled every note, most audibly as a piano note under
each sound-board sample.

Sample playback caps concurrent voices at 32, stealing the oldest beyond that.
Samples run several seconds and keys can be mashed faster than they finish, so
an uncapped graph grows until the render thread cannot keep the output device's
buffer fed — a starved stream stalls all playback, not just the newest note. The
player also logs when the audio context leaves the running state (once per
stall, with the state) and when it recovers, so a stalled stream is visible in
the log rather than presenting as silent dead keys.

Speech volume is tunable via MUSIC_SPEECH_VOLUME (0-1) and defaults to 0.5:
announcements share an output with the instruments and should not drown them
out.
