-- Tracks as clients see them, by GUID, and the fields the track commands write.
local recinput = require("recinput")
local refuse = require("refuse")

local tracks = {}

local MONITOR_NAMES = { [0] = "off", [1] = "on", [2] = "auto" }
local MONITOR_VALUES = { off = 0, on = 1, auto = 2 }

function tracks.describe(track, index)
  local _, name = reaper.GetSetMediaTrackInfo_String(track, "P_NAME", "", false)
  return {
    id = reaper.GetTrackGUID(track),
    index = index,
    name = name,
    armed = reaper.GetMediaTrackInfo_Value(track, "I_RECARM") == 1,
    monitor = MONITOR_NAMES[math.floor(reaper.GetMediaTrackInfo_Value(track, "I_RECMON"))],
    input = recinput.decode(reaper.GetMediaTrackInfo_Value(track, "I_RECINPUT")),
  }
end

function tracks.all()
  local all = {}
  for index = 0, reaper.CountTracks(0) - 1 do
    all[#all + 1] = tracks.describe(reaper.GetTrack(0, index), index)
  end
  return all
end

-- the track with a GUID, and its index, or TRACK_NOT_FOUND
function tracks.find(id)
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    if reaper.GetTrackGUID(track) == id then
      return track, index
    end
  end
  refuse("TRACK_NOT_FOUND", "no track " .. id .. " in the current project", { track = id })
end

-- checks the fields a write sets, before anything changes, and returns them ready to apply
function tracks.prepare(options)
  local changes = {}
  if options.name ~= nil then
    if type(options.name) ~= "string" then
      refuse("BAD_REQUEST", "name must be a string")
    end
    changes.name = options.name
  end
  if options.input ~= nil then
    changes.input = recinput.encode(options.input)
  end
  if options.armed ~= nil then
    if type(options.armed) ~= "boolean" then
      refuse("BAD_REQUEST", "armed must be true or false")
    end
    changes.armed = options.armed and 1 or 0
  end
  if options.monitor ~= nil then
    changes.monitor = MONITOR_VALUES[options.monitor]
    if changes.monitor == nil then
      refuse("BAD_REQUEST", "monitor must be off, on or auto")
    end
  end
  return changes
end

function tracks.apply(track, changes)
  if changes.name ~= nil then
    reaper.GetSetMediaTrackInfo_String(track, "P_NAME", changes.name, true)
  end
  if changes.input ~= nil then
    reaper.SetMediaTrackInfo_Value(track, "I_RECINPUT", changes.input)
  end
  if changes.armed ~= nil then
    reaper.SetMediaTrackInfo_Value(track, "I_RECARM", changes.armed)
  end
  if changes.monitor ~= nil then
    reaper.SetMediaTrackInfo_Value(track, "I_RECMON", changes.monitor)
  end
end

-- runs a change as one undo point, without redrawing midway
function tracks.undoable(description, change)
  reaper.Undo_BeginBlock2(0)
  reaper.PreventUIRefresh(1)
  local ok, result = pcall(change)
  reaper.PreventUIRefresh(-1)
  reaper.Undo_EndBlock2(0, description, -1)
  if not ok then
    error(result, 0)
  end
  return result
end

return tracks
