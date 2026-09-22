---
'@thrashplay/music': minor
---

The Outbox is one folder per project, and each clip's files are named `<YYYYMMDD> - <0012> - <name>` (recording date, padded clip number, given name or "Clip 12"), with `manifest.json` in the project's folder.

The package's `reaper/` folder splits into `studio/` (the watcher, installed by the app) and `producer/`: `cs-studio-import.lua` blesses clips into the open REAPER project on the review machine (stems copied into the project's media folder, one muted folder track per clip at time zero, MIDI rebuilt from the Outbox file), with `install-producer.ps1` to install it and write its config. The manifest gains the project folder name and each source item's start time.
