---
'@thrashplay/music': minor
---

Add the recording studio: a REAPER web-remote client, a polling `StudioService` that owns transport state, the list of recorded takes (project regions), and record / stop / play-take actions, and a two-pad Launchpad transport overlay (record, play my last one) drawn above every program. `createLauncher` accepts persistent `overlays`; `createLauncherProgram` takes a `studio` service and adds the transport. Enabled by `MUSIC_REAPER_URL`.
