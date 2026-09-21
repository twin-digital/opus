---
'@thrashplay/music': patch
---

The studio watcher now finds rename requests written through REAPER's web remote (which upper-cases ext-state keys), reports its version and errors on the ReaScript console, and uses wall-clock time. `music-studio-preview` drives a real REAPER when `MUSIC_REAPER_URL` is set. Adds `reaper-probe.mjs` / `.ps1`, dependency-free checks of the REAPER web remote and the watcher round trip.
