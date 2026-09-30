-- Creates a named track, at the end or at an index, with any of its input, arming and monitoring.
local refuse = require("refuse")
local tracks = require("tracks")

return function(options)
  if type(options.name) ~= "string" then
    refuse("BAD_REQUEST", "a new track needs a name")
  end
  local changes = tracks.prepare(options)
  local count = reaper.CountTracks(0)
  local index = options.index
  if index == nil then
    index = count
  elseif type(index) ~= "number" or index % 1 ~= 0 or index < 0 or index > count then
    refuse("BAD_REQUEST", string.format("index must be a whole number from 0 to %d", count))
  end
  return tracks.undoable("CS Studio: create track", function()
    reaper.InsertTrackAtIndex(math.floor(index), true)
    local track = reaper.GetTrack(0, index)
    tracks.apply(track, changes)
    return { track = tracks.describe(track, index) }
  end)
end
