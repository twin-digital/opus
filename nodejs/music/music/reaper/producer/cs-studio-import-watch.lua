-- Continuous import: keeps cs-studio-import.lua running in the background, bringing new
-- eligible clips into the open project (once it has had an on-demand import) every
-- watch_seconds. Load this from the Actions list, or from __startup.lua to run at launch.
CS_STUDIO_IMPORT_MODE = "watch"
dofile(debug.getinfo(1, "S").source:sub(2):match("^(.*)[/\\]") .. "/cs-studio-import.lua")
