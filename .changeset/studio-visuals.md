---
'@thrashplay/music': minor
---

Studio touch page visuals: a strip under the header shows the playing clip's waveform (wavesurfer.js over the clip's Outbox mix, served at `/clips/<id>.wav`) with a cursor that follows REAPER and seeks on tap, a live level graph while recording, and per-track meters with peak hold whenever the transport moves. The service polls every 50 ms while playing or recording and exposes per-track levels and the position within the playing clip; `playTake` accepts an offset. The on-screen keyboard is half width, centered. `MUSIC_STUDIO_OUTBOX` points the app at the watcher's Outbox. The watcher renders clips up to `render_now_seconds` (3 min) the moment they end, so their waveforms appear almost at once, and renders under a temporary name that is renamed into place, so a mix in the Outbox is always whole.
