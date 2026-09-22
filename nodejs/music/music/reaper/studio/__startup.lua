-- REAPER runs this file on launch. Starts the studio watcher; installed by the studio app.
dofile(reaper.GetResourcePath() .. "/Scripts/Studio/cs-studio-watcher.lua")
