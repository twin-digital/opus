---
'@thrashplay/music': minor
---

The studio watcher keeps a clip library (`cs-studio-library.json` beside the project: number, label, bounds, how the take ended, source files, render record) and fills an Outbox while the studio is idle: a rendered mix and a MIDI file per clip, and a manifest. Renames move the files, trims re-render, deletions remove them. The app tolerates the short stall a render causes instead of flagging REAPER offline.
