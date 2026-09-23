---
'@thrashplay/music': patch
---

Studio: REAPER counts as unreachable after two seconds without an answer rather than after three polls, so a render or a save no longer flashes the offline overlay; a stop at a take's end that went astray is retried every 250 ms with one warning, so it lands well inside the gap before the next take; `localhost` in MUSIC_REAPER_URL is sent as 127.0.0.1.
