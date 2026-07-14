---
'@thrashplay/music': patch
---

Field fixes from the first hardware session with sound boards.

The sound picker turns the piano's Local Control off while it runs (and restores
it on shutdown), so the keyboard stops sounding its own keys: every key press is
re-voiced through the app — as an echoed program or a sample — and the piano's
factory tone underneath doubled every note, most audibly as a piano note under
each sound-board sample.

Sample playback no longer stalls after a minute or two of sustained playing.
Voice cleanup listened for each source's 'ended' event, and registering any
listener on a source keeps its node alive in node-web-audio-api's render graph
forever (ircam-ismm/node-web-audio-api#168) — so the graph grew with every note
until the render thread starved the output device, silencing every process
using it (speech synthesis included) until a few idle minutes let it recover.
Voices are now torn down by a timer derived from the buffer's own duration, and
no listener is ever registered on a source. Concurrent voices are also capped
at 32 (stealing the oldest), and the player logs when the audio context leaves
the running state and when it recovers, so a stalled stream is visible in the
log rather than presenting as silent dead keys.

Speech volume is tunable via MUSIC_SPEECH_VOLUME (0-1) and defaults to 0.5:
announcements share an output with the instruments and should not drown them
out.
