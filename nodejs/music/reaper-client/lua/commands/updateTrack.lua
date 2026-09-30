-- Changes any of a track's name, input, arming and monitoring; fields left out stay as they are.
local refuse = require("refuse")
local tracks = require("tracks")

return {
  run = function(options)
    if type(options.track) ~= "string" then
      refuse("BAD_REQUEST", "track must be a track id")
    end
    local changes = tracks.prepare(options)
    local track, index = tracks.find(options.track)
    return tracks.undoable("CS Studio: update track", function()
      tracks.apply(track, changes)
      return { track = tracks.describe(track, index) }
    end)
  end,
  target = function(options)
    return "track:" .. tostring(options.track)
  end,
}
