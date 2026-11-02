-- The current project's tracks, in order.
local tracks = require("tracks")

return function()
  return { tracks = tracks.all() }
end
