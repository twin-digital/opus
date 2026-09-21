---
'@thrashplay/music': minor
---

The studio app ships and installs its REAPER watcher: on start it writes `cs-studio-watcher.lua`, a user-owned `cs-studio-config.lua`, and the startup hook into REAPER's resource path, asks a running watcher of a different version to reload itself, and refuses to start when REAPER is not running the shipped file (`--ignore-helper-mismatch` downgrades that to a warning and a banner on the touch page). The watcher's settings move to `cs-studio-config.lua`. The `reaper/` folder moves into the package.
