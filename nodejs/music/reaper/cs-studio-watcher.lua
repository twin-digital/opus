-- Studio watcher: runs in the background inside REAPER.
--
-- After every recording it wraps the new items in a named "Clip N" region, trims the
-- silent tail, moves the edit cursor past them, and saves the project. While recording it
-- watches for activity on the configured inputs and stops a take that has gone quiet for
-- too long, or that has hit the hard length cap.

local CONFIG = {
  -- Stop any take longer than this, no matter what.
  max_take_seconds = 60 * 60,

  -- Stop a take once no configured input has shown activity for this long.
  silence_seconds = 3 * 60,

  -- Trim the take to the last activity plus this much tail. Non-destructive: the audio
  -- stays in the file and the item edge can be dragged back out in REAPER.
  trim_silence = true,
  tail_seconds = 5,

  -- Inputs that count as "someone is playing". Any one of them keeps the take alive.
  --   { type = "midi",  device = "<substring of the MIDI input device name>" }
  --       Any note-on from that device. Empty string matches every enabled device.
  --   { type = "audio", track = "<track name>", threshold_db = -50 }
  --       Track meter peak above the threshold. The track must be metering its input
  --       (record-armed with input monitoring, or REAPER's "meter input when armed").
  activity = {
    { type = "midi", device = "IAC" },
    -- { type = "audio", track = "Piano", threshold_db = -50 },
    -- { type = "audio", track = "Vocal", threshold_db = -35 },
  },

  -- Silence between takes on the timeline.
  gap_seconds = 2,

  -- Log each step to REAPER's console (View > ReaScript console), to see what a take did.
  debug = false,

  -- How long after the transport stops to wait for REAPER to commit the recorded items.
  finalize_timeout_seconds = 2,
}

local EXT_SECTION = "Studio"
local ACTION_STOP = 1016

local wasRecording = false
local itemsBefore = {}
local itemsBeforeCount = -1
local recStart = 0
local lastActivity = 0
local midiEventCount = 0
local finalizeDeadline = nil
local publishedProjectName = nil

local function log(message)
  if CONFIG.debug then
    reaper.ShowConsoleMsg(string.format("[Studio] %s\n", message))
  end
end

-- ---------------------------------------------------------------------------------------
-- helpers

local function isRecording()
  return reaper.GetPlayState() & 4 == 4
end

local function itemGuid(item)
  local _, guid = reaper.GetSetMediaItemInfo_String(item, "GUID", "", false)
  return guid
end

local function snapshotItems()
  local set = {}
  for i = 0, reaper.CountMediaItems(0) - 1 do
    set[itemGuid(reaper.GetMediaItem(0, i))] = true
  end
  return set
end

local function findTrack(name)
  for i = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, i)
    local _, trackName = reaper.GetTrackName(track)
    if trackName == name then return track end
  end
  return nil
end

local function nextTakeNumber()
  local _, val = reaper.GetProjExtState(0, EXT_SECTION, "take_count")
  local n = (tonumber(val) or 0) + 1
  reaper.SetProjExtState(0, EXT_SECTION, "take_count", tostring(n))
  return n
end

local function toDb(amplitude)
  return 20 * math.log(math.max(amplitude, 1e-9), 10)
end

-- ---------------------------------------------------------------------------------------
-- activity detection

-- New note-ons since the last poll, from the global MIDI input buffer (idx 0 = newest).
local function pollMidiActivity(deviceFilter)
  local count = reaper.MIDI_GetRecentInputEvent(0)
  local fresh = math.min(count - midiEventCount, 64)
  midiEventCount = count
  local latest = nil
  for i = 0, fresh - 1 do
    local _, buf, _, devIdx, projPos = reaper.MIDI_GetRecentInputEvent(i)
    local status = buf:byte(1) or 0
    local velocity = buf:byte(3) or 0
    local isNoteOn = (status & 0xF0) == 0x90 and velocity > 0
    if isNoteOn then
      local _, devName = reaper.GetMIDIInputName(devIdx, "")
      if deviceFilter == "" or devName:find(deviceFilter, 1, true) then
        local at = projPos > 0 and projPos or reaper.GetPlayPosition()
        if latest == nil or at > latest then latest = at end
      end
    end
  end
  return latest
end

local function pollAudioActivity(trackName, thresholdDb)
  local track = findTrack(trackName)
  if track == nil then return nil end
  local peak = math.max(reaper.Track_GetPeakInfo(track, 0), reaper.Track_GetPeakInfo(track, 1))
  if toDb(peak) > thresholdDb then
    return reaper.GetPlayPosition()
  end
  return nil
end

local function pollActivity()
  for _, source in ipairs(CONFIG.activity) do
    local at = nil
    if source.type == "midi" then
      at = pollMidiActivity(source.device or "")
    elseif source.type == "audio" then
      at = pollAudioActivity(source.track, source.threshold_db or -50)
    end
    if at ~= nil and at > lastActivity then lastActivity = at end
  end
end

-- ---------------------------------------------------------------------------------------
-- take lifecycle

-- The web remote cannot report the project name, so it is kept in project ext state, where
-- the app's status query can read it (shown as the touch page's title).
local function publishProjectName()
  local name = reaper.GetProjectName(0, ""):gsub("%.[rR][pP][pP]$", "")
  if name ~= publishedProjectName then
    reaper.SetProjExtState(0, EXT_SECTION, "project_name", name)
    publishedProjectName = name
  end
end

-- REAPER creates the recording items before this script sees the record state, so the
-- "before" snapshot is taken while idle and only refreshed when the item count changes.
local function whileIdle()
  publishProjectName()
  local count = reaper.CountMediaItems(0)
  if count ~= itemsBeforeCount then
    itemsBefore = snapshotItems()
    itemsBeforeCount = count
  end
end

local function onRecordingStarted()
  recStart = reaper.GetPlayPosition()
  lastActivity = recStart
  midiEventCount = reaper.MIDI_GetRecentInputEvent(0)
  log(string.format("recording started at %.2fs; %d items before", recStart, itemsBeforeCount))
end

local function whileRecording()
  pollActivity()
  local now = reaper.GetPlayPosition()
  if now - recStart >= CONFIG.max_take_seconds then
    reaper.ShowConsoleMsg("[Studio] Take hit the length cap; stopping.\n")
    reaper.Main_OnCommand(ACTION_STOP, 0)
  elseif now - lastActivity >= CONFIG.silence_seconds then
    reaper.ShowConsoleMsg("[Studio] No activity; stopping.\n")
    reaper.Main_OnCommand(ACTION_STOP, 0)
  end
end

local function newItems()
  local items = {}
  for i = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, i)
    if not itemsBefore[itemGuid(item)] then items[#items + 1] = item end
  end
  return items
end

-- Returns true once the take is finalized, false while still waiting for REAPER to commit the
-- recorded items (it can report the transport stopped a moment before they exist).
local function onRecordingFinished()
  local items = newItems()
  if #items == 0 then
    finalizeDeadline = finalizeDeadline or (os.clock() + CONFIG.finalize_timeout_seconds)
    if os.clock() < finalizeDeadline then return false end
    reaper.ShowConsoleMsg("[Studio] Recording stopped but no new items appeared; no take created.\n")
    return true
  end
  log(string.format("recording finished; %d new items, last activity at %.2fs", #items, lastActivity))

  local first, last = math.huge, -math.huge
  for _, item in ipairs(items) do
    local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    first = math.min(first, pos)
    last = math.max(last, pos + len)
  end

  -- Trim the quiet tail. An empty take keeps tail_seconds (at least one second) so it stays visible.
  if CONFIG.trim_silence then
    local cut = math.max(lastActivity + CONFIG.tail_seconds, first + 1)
    if cut < last then
      for _, item in ipairs(items) do
        local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
        local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
        if pos + len > cut then
          reaper.SetMediaItemInfo_Value(item, "D_LENGTH", math.max(cut - pos, 0.1))
        end
      end
      last = cut
    end
  end

  local n = nextTakeNumber()
  local name = string.format("Clip %d - %s", n, os.date("%b %d, %I:%M %p"))
  if lastActivity <= recStart then name = name .. " (empty)" end
  local color = reaper.ColorToNative(80, 160, 255) | 0x1000000
  reaper.AddProjectMarker2(0, true, first, last, name, -1, color)

  reaper.SetEditCurPos(last + CONFIG.gap_seconds, true, false)
  reaper.UpdateArrange()
  reaper.Main_SaveProject(0, false)
  log(string.format("created region '%s' (%.2fs - %.2fs) and saved", name, first, last))
  return true
end

local function tick()
  local recording = isRecording()
  if recording and not wasRecording then
    onRecordingStarted()
  elseif recording then
    whileRecording()
  elseif wasRecording then
    if not onRecordingFinished() then
      reaper.defer(tick)
      return -- still finalizing: stay in the "was recording" state
    end
    finalizeDeadline = nil
    itemsBeforeCount = -1
    whileIdle() -- re-snapshot now, so the take just finished can never count as new again
  else
    whileIdle()
  end
  wasRecording = recording
  reaper.defer(tick)
end

-- Park the cursor after existing material so the first take appends cleanly.
reaper.SetEditCurPos(reaper.GetProjectLength(0) + CONFIG.gap_seconds, false, false)
tick()
