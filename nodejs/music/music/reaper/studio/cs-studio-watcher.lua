-- Studio watcher: runs in the background inside REAPER.
--
-- After every recording it wraps the new items in a named "Clip N" region, trims the
-- silent tail, moves the edit cursor past them, and saves the project. While recording it
-- watches for activity on the configured inputs and stops a take that has gone quiet for
-- too long, or that has hit the hard length cap.
--
-- Installed and kept current by the studio app (@thrashplay/music), which compares the
-- hash of this file with the one it ships. Settings live in cs-studio-config.lua beside
-- this file, so they can change without changing the hash.

local DEFAULTS = {
  -- Stop any take longer than this, no matter what.
  max_take_seconds = 60 * 60,

  -- Stop a take once no configured input has shown activity for this long.
  silence_seconds = 3 * 60,

  -- Trim the take to the first activity minus head_seconds and the last activity plus
  -- tail_seconds. Non-destructive: the audio stays in the file and the item edges can be
  -- dragged back out in REAPER. Nothing is trimmed when no activity source fired at all.
  trim_silence = true,
  head_seconds = 0.5,
  tail_seconds = 5,

  -- Trimming looks at everything recorded, not only the activity sources: every recorded
  -- audio file is scanned for sound above this level, so a part sung before the piano comes
  -- in (or after it stops) is kept. Set it above the mic's room noise.
  trim_audio_db = -40,

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

  -- The Outbox: a rendered mix and a MIDI file per clip, plus a manifest, kept in sync with
  -- the project while the studio is idle (nothing playing or recording, no key pressed and
  -- no transport change for render_idle_seconds). "~" is the home folder. Clips longer than
  -- render_long_seconds wait for render_long_idle_seconds of idle instead.
  outbox = "~/Music/Studio Outbox",
  render = true,
  midi_export = true,
  -- A clip up to this long is rendered the moment it ends (a few seconds of REAPER's time),
  -- so its waveform is on the page almost at once. Longer ones wait for idle.
  render_now_seconds = 3 * 60,
  render_idle_seconds = 30,
  render_long_seconds = 10 * 60,
  render_long_idle_seconds = 5 * 60,

  -- Loudness the mix is normalized to (integrated LUFS), so the review copy plays at a
  -- normal level on a phone however quiet the piano's USB signal is. false leaves the
  -- render at the project's own level. The recorded files are never changed.
  normalize_lufs = -14,
}

local SCRIPT_PATH = debug.getinfo(1, "S").source:sub(2)
local SCRIPT_DIR = SCRIPT_PATH:match("^(.*)[/\\]") or "."

-- cs-studio-config.lua, beside this file, returns a table overriding any of the defaults.
local function loadConfig()
  local config = {}
  for key, value in pairs(DEFAULTS) do config[key] = value end
  local ok, overrides = pcall(dofile, SCRIPT_DIR .. "/cs-studio-config.lua")
  if ok and type(overrides) == "table" then
    for key, value in pairs(overrides) do config[key] = value end
  end
  return config
end

local CONFIG = loadConfig()

local VERSION = "2026-09-25.4" -- bump when changing the script, so the console shows which copy runs
local EXT_SECTION = "Studio"
-- REAPER's web remote upper-cases the section and key when it writes (its reads are
-- case-insensitive), so requests from the app live under this spelling.
local REQUEST_SECTION = EXT_SECTION:upper()

local function readRequest(key)
  local _, value = reaper.GetProjExtState(0, REQUEST_SECTION, key:upper())
  return value or ""
end

local function clearRequest(key)
  reaper.SetProjExtState(0, REQUEST_SECTION, key:upper(), "")
end
local ACTION_STOP = 1016

local function projectFile()
  local _, file = reaper.EnumProjects(-1, "")
  if file == nil or file == "" then return nil end
  return file
end

local wasRecording = false
local itemsBefore = {}
local itemsBeforeCount = -1
local pendingCount = nil -- an item count seen once while idle; it becomes the snapshot when seen again
local recStart = 0
local lastActivity = 0
local firstActivity = nil -- first activity seen in the current take, nil until one is
local midiEventCount = 0
local finalizeDeadline = nil
local lastFinalized = nil -- clip number of the take just finalized, rendered right away if short
local markBusy -- defined with the idle trackers below
local stoppedBy = "user"
local publishedProjectName = nil
local publishedIdentity = false

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

local audioAbove = {} -- per track: whether the meter was above the threshold last tick

-- While recording, sound above the threshold counts every tick (that is what the silence
-- timer needs). While idle only a crossing counts, so steady room noise on a mic cannot hold
-- the studio "busy" forever.
local function pollAudioActivity(trackName, thresholdDb, edgeOnly)
  local track = findTrack(trackName)
  if track == nil then return nil end
  local peak = math.max(reaper.Track_GetPeakInfo(track, 0), reaper.Track_GetPeakInfo(track, 1))
  local above = toDb(peak) > thresholdDb
  local wasAbove = audioAbove[trackName] == true
  audioAbove[trackName] = above
  if above and (not edgeOnly or not wasAbove) then
    return reaper.GetPlayPosition()
  end
  return nil
end

-- Returns true when any source showed activity this tick, and moves lastActivity /
-- firstActivity (project time) along.
local function pollActivity()
  local seen = false
  local recording = isRecording()
  for _, source in ipairs(CONFIG.activity) do
    local at = nil
    if source.type == "midi" then
      at = pollMidiActivity(source.device or "")
    elseif source.type == "audio" then
      at = pollAudioActivity(source.track, source.threshold_db or -50, not recording)
    end
    if at ~= nil then
      seen = true
      if at > lastActivity then lastActivity = at end
      if firstActivity == nil or at < firstActivity then firstActivity = at end
    end
  end
  return seen
end

-- ---------------------------------------------------------------------------------------
-- take lifecycle

-- The web remote cannot report the project name, so it is kept in project ext state, where
-- the app's status query can read it (shown as the touch page's title).
-- FNV-1a (32-bit) over the file's bytes; the app runs the same function over the copy it
-- ships and warns when they differ. Written without wide multiplies or bitwise ops on the
-- full word, so it gives the same answer under any Lua number model.
local function fnv1a32(data)
  local h = 2166136261
  for i = 1, #data do
    local low = h % 256
    h = h - low + (low ~ data:byte(i))
    h = (h * 403 + (h % 256) * 16777216) % 4294967296 -- h * 16777619 mod 2^32
  end
  return string.format("%04x%04x", h // 65536, h % 65536)
end

local function hashSelf()
  local file = io.open ~= nil and io.open(SCRIPT_PATH, "rb") or nil
  if file == nil then return "unreadable" end
  local data = file:read("a")
  file:close()
  return fnv1a32(data)
end

local SCRIPT_HASH = hashSelf()

-- The app asks for a reload (after installing a newer file) through ext state. The running
-- loop ends and the file on disk starts in its place, in this same script instance.
local function reloadRequested()
  if readRequest("reload") == "" then return false end
  if isRecording() or wasRecording then return false end -- finish the take first; the app asks again
  clearRequest("reload")
  return true
end

local function publishProjectName()
  local name = reaper.GetProjectName(0, ""):gsub("%.[rR][pP][pP]$", "")
  if name ~= publishedProjectName then
    reaper.SetProjExtState(0, EXT_SECTION, "project_name", name)
    publishedProjectName = name
  end
end

-- Rename requests arrive from the touch page as project ext state: key "rename_<region id>",
-- value the new label. The region keeps its "Clip N" prefix so ordering survives. Each region's
-- key is read directly by name rather than enumerating the section, which has proven unreliable
-- for keys written through the web remote.
local function applyRenames()
  local renamed = false
  local j = 0
  while true do
    local retval, isrgn, pos, rgnend, name, idx, color = reaper.EnumProjectMarkers3(0, j)
    if retval == 0 then break end
    if isrgn then
      local key = "rename_" .. tostring(idx)
      local label = readRequest(key)
      if label ~= "" then
        log(string.format("rename request for region %d: '%s'", idx, label))
        local prefix = name:match("^(%a+ %d+)") or name
        local newName = prefix .. " - " .. label
        if newName ~= name then
          reaper.SetProjectMarker3(0, idx, true, pos, rgnend, newName, color)
          log(string.format("renamed region %d to '%s'", idx, newName))
          renamed = true
        end
        clearRequest(key) -- consumed
      end
    end
    j = j + 1
  end
  if renamed then
    reaper.UpdateArrange()
    if projectFile() ~= nil then reaper.Main_SaveProject(0, false) end
  end
end


-- ---------------------------------------------------------------------------------------
-- json (just enough for the library file: objects, arrays, strings, numbers, booleans, null)

local json = {}

local function jsonEscape(str)
  return str:gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" elseif c == "\n" then return "\\n"
    elseif c == "\r" then return "\\r" elseif c == "\t" then return "\\t" end
    return string.format("\\u%04x", c:byte())
  end)
end

local function isArray(t)
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  return n == #t
end

function json.encode(value, indent, depth)
  indent = indent or ""
  depth = depth or 0
  local t = type(value)
  if value == nil or value == json.null then return "null" end
  if t == "boolean" then return tostring(value) end
  if t == "number" then
    if value ~= value or value == math.huge or value == -math.huge then return "null" end
    if math.type(value) == "integer" then return tostring(value) end
    return string.format("%.17g", value)
  end
  if t == "string" then return '"' .. jsonEscape(value) .. '"' end
  if t ~= "table" then error("cannot encode " .. t) end
  local pad = indent ~= "" and ("\n" .. indent:rep(depth + 1)) or ""
  local close = indent ~= "" and ("\n" .. indent:rep(depth)) or ""
  local parts = {}
  if isArray(value) then
    if #value == 0 then return "[]" end
    for _, v in ipairs(value) do parts[#parts + 1] = pad .. json.encode(v, indent, depth + 1) end
    return "[" .. table.concat(parts, ",") .. close .. "]"
  end
  local keys = {}
  for k in pairs(value) do keys[#keys + 1] = tostring(k) end
  table.sort(keys, function(a, b)
    local na, nb = tonumber(a), tonumber(b)
    if na and nb then return na < nb end
    return a < b
  end)
  for _, k in ipairs(keys) do
    local v = value[k]
    if v == nil then v = value[tonumber(k)] end
    parts[#parts + 1] = pad .. '"' .. jsonEscape(k) .. '":' .. (indent ~= "" and " " or "") .. json.encode(v, indent, depth + 1)
  end
  return "{" .. table.concat(parts, ",") .. close .. "}"
end

json.null = setmetatable({}, { __tostring = function() return "null" end })

function json.decode(text)
  local pos = 1
  local function skip() pos = text:find("%S", pos) or (#text + 1) end
  local value
  local function str()
    local out = {}
    pos = pos + 1
    while true do
      local c = text:sub(pos, pos)
      if c == "" then error("unterminated string") end
      if c == '"' then pos = pos + 1; return table.concat(out) end
      if c == "\\" then
        local e = text:sub(pos + 1, pos + 1)
        local map = { n = "\n", r = "\r", t = "\t", b = "\b", f = "\f", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }
        if e == "u" then
          out[#out + 1] = utf8.char(tonumber(text:sub(pos + 2, pos + 5), 16))
          pos = pos + 6
        else
          out[#out + 1] = map[e] or e
          pos = pos + 2
        end
      else
        out[#out + 1] = c
        pos = pos + 1
      end
    end
  end
  value = function()
    skip()
    local c = text:sub(pos, pos)
    if c == "{" then
      local obj = {}
      pos = pos + 1
      skip()
      if text:sub(pos, pos) == "}" then pos = pos + 1; return obj end
      while true do
        skip()
        local k = str()
        skip()
        pos = pos + 1 -- ':'
        obj[k] = value()
        skip()
        local d = text:sub(pos, pos)
        pos = pos + 1
        if d == "}" then return obj end
      end
    elseif c == "[" then
      local arr = {}
      pos = pos + 1
      skip()
      if text:sub(pos, pos) == "]" then pos = pos + 1; return arr end
      while true do
        arr[#arr + 1] = value()
        skip()
        local d = text:sub(pos, pos)
        pos = pos + 1
        if d == "]" then return arr end
      end
    elseif c == '"' then
      return str()
    elseif text:sub(pos, pos + 3) == "true" then pos = pos + 4; return true
    elseif text:sub(pos, pos + 4) == "false" then pos = pos + 5; return false
    elseif text:sub(pos, pos + 3) == "null" then pos = pos + 4; return json.null
    else
      local num = text:match("^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
      if num == nil or num == "" then error("bad json at " .. pos) end
      pos = pos + #num
      return math.tointeger(tonumber(num)) or tonumber(num)
    end
  end
  return value()
end

-- ---------------------------------------------------------------------------------------
-- files and paths

local SEP = package.config:sub(1, 1)

local function expandHome(path)
  local home = os.getenv("HOME") or os.getenv("USERPROFILE") or ""
  return (path:gsub("^~", home))
end

local function fileExists(path)
  local f = io.open(path, "rb")
  if f == nil then return false end
  f:close()
  return true
end

local function readFile(path)
  local f = io.open(path, "rb")
  if f == nil then return nil end
  local data = f:read("a")
  f:close()
  return data
end

local function writeFile(path, data)
  local f = io.open(path, "wb")
  if f == nil then return false end
  local ok = f:write(data)
  f:close()
  return ok ~= nil
end

-- Written beside the target and swapped in, so a reader (or the mirror copying the Outbox)
-- never sees a half-written file.
local function writeFileAtomic(path, data)
  local temp = path .. ".tmp"
  if not writeFile(temp, data) then
    os.remove(temp)
    return writeFile(path, data) -- better a direct write than no file
  end
  if SEP == "\\" then os.remove(path) end -- only Windows refuses to rename over a file
  local ok = os.rename(temp, path)
  if not ok then
    os.remove(temp)
    return writeFile(path, data)
  end
  return true
end

local function projectDir()
  local file = projectFile()
  return file and (file:match("^(.*)[/\\]") or ".") or nil
end

local function currentProjectName()
  return (reaper.GetProjectName(0, ""):gsub("%.[rR][pP][pP]$", ""))
end

-- A label as it can appear in a file name on both macOS and Windows.
local function safeName(text)
  return (text:gsub('[<>:"/\\|?*$%c]', " "):gsub("%s+", " "):gsub("^%s+", ""):gsub("[%s.]+$", ""))
end

-- Local time with its UTC offset ("2026-09-22T18:41:07-05:00"): a real timestamp, whose first
-- ten characters are also the local calendar day the file names sort by.
local function localNow()
  local now = os.time()
  local utc = os.date("!*t", now)
  utc.isdst = os.date("*t", now).isdst
  local offsetMinutes = math.floor(os.difftime(now, os.time(utc)) / 60 + 0.5)
  local sign = offsetMinutes < 0 and "-" or "+"
  offsetMinutes = math.abs(offsetMinutes)
  return os.date("%Y-%m-%dT%H:%M:%S", now) .. string.format("%s%02d:%02d", sign, offsetMinutes // 60, offsetMinutes % 60)
end

-- "Sep 22, 04:36 PM", with AM/PM spelled the same in every locale, as fileLabel expects.
local function timestampLabel()
  local t = os.date("*t")
  local hour12 = t.hour % 12
  if hour12 == 0 then hour12 = 12 end
  local months = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" }
  return string.format("%s %d, %02d:%02d %s", months[t.month], t.day, hour12, t.min, t.hour < 12 and "AM" or "PM")
end

local function near(a, b)
  return math.abs((a or 0) - (b or 0)) < 0.001
end

-- ---------------------------------------------------------------------------------------
-- clip library: one JSON document per project, beside the project file, and the manifest
-- exported to the Outbox

local LIBRARY_FILE = "cs-studio-library.json"
local library = nil -- loaded lazily once the project has a file
local libraryLoadedFrom = nil

local function libraryPath()
  local dir = projectDir()
  return dir and (dir .. SEP .. LIBRARY_FILE) or nil
end

local function loadLibrary()
  local path = libraryPath()
  if path == nil then return nil end
  if library ~= nil and libraryLoadedFrom == path then return library end
  library = nil -- a different project is open now; never carry another project's entries over
  libraryLoadedFrom = path
  local text = readFile(path)
  if text ~= nil then
    local ok, parsed = pcall(json.decode, text)
    if ok and type(parsed) == "table" and type(parsed.clips) == "table" then
      library = parsed
    else
      reaper.ShowConsoleMsg("[Studio] The clip library could not be read; starting a new one. [" .. path .. "]\n")
    end
  end
  if library == nil then
    library = { version = 1, project = {}, clips = {} }
  end
  return library
end

-- Each project gets its own folder under the Outbox, so a folder listing is one project's
-- clips in date order.
local function outboxDir()
  return expandHome(CONFIG.outbox) .. SEP .. safeName(currentProjectName())
end

local function manifestPath()
  return outboxDir() .. SEP .. "manifest.json"
end

local function saveLibrary()
  local path = libraryPath()
  if library == nil or path == nil then return end
  local dir = projectDir() or ""
  library.project = {
    name = currentProjectName(),
    file = (projectFile() or ""):match("[^/\\]+$"),
    folder = dir:match("[^/\\]+$") or "",
    updatedAt = localNow(),
  }
  local text = json.encode(library, "  ") .. "\n"
  writeFileAtomic(path, text)
  if CONFIG.render or CONFIG.midi_export then
    reaper.RecursiveCreateDirectory(outboxDir(), 0)
    writeFileAtomic(manifestPath(), text)
  end
end

local function clipEntry(number)
  local lib = loadLibrary()
  return lib and lib.clips[tostring(number)] or nil
end

-- Called at finalize with the new items, so the entry knows its source files and how it ended.
local function recordClip(number, label, first, last, items, stoppedBy, regionId)
  local lib = loadLibrary()
  if lib == nil then return end
  local sources = {}
  for _, item in ipairs(items) do
    local track = reaper.GetMediaItem_Track(item)
    local _, trackName = reaper.GetTrackName(track)
    local take = reaper.GetActiveTake(item)
    local file = json.null
    if take ~= nil and not reaper.TakeIsMIDI(take) then
      local source = reaper.GetMediaItemTake_Source(take)
      local name = reaper.GetMediaSourceFileName(source, "")
      local dir = projectDir() or ""
      if name:sub(1, #dir) == dir then name = name:sub(#dir + 2) end
      file = name
    end
    -- where the file itself begins in project time (an item trimmed at the head starts later
    -- than its file); the importer places stems from this
    local itemStart = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    if take ~= nil then itemStart = itemStart - reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS") end
    sources[#sources + 1] = { track = trackName, file = file, itemStart = itemStart }
  end
  lib.clips[tostring(number)] = {
    number = number,
    regionId = regionId,
    label = label,
    createdAt = localNow(),
    start = first,
    ["end"] = last,
    starred = false,
    archived = false,
    stoppedBy = stoppedBy,
    sources = sources,
    render = json.null,
  }
  saveLibrary()
end

-- ---------------------------------------------------------------------------------------
-- outbox: the rendered mix and MIDI file per clip

-- The label the watcher gives an unnamed clip is its timestamp (plus "(empty)" when nothing was
-- played); file names leave the timestamp out.
local function fileLabel(label)
  local rest = label:match("^%a%a%a %d%d?, %d%d?:%d%d [AP]M%s*(.*)$")
  if rest ~= nil then return rest end
  return label
end

-- "<YYYYMMDD> - <0012> - <slug>": date first for sorting, the number padded so it sorts too,
-- then the given name, or "Clip 12" when there is none.
local function clipBaseName(entry)
  local text = fileLabel(entry.label)
  local slug
  if text == "" then
    slug = string.format("Clip %d", entry.number)
  elseif text:sub(1, 1) == "(" then
    slug = string.format("Clip %d %s", entry.number, text)
  else
    slug = text
  end
  local date = (type(entry.createdAt) == "string" and #entry.createdAt >= 10) and entry.createdAt:sub(1, 10):gsub("-", "") or os.date("%Y%m%d")
  return safeName(string.format("%s - %04d - %s", date, entry.number, slug))
end

local function outboxFiles(base)
  local found = {}
  local dir = outboxDir()
  reaper.EnumerateFiles(dir, -1) -- REAPER caches directory listings; force a re-read
  local i = 0
  while true do
    local name = reaper.EnumerateFiles(dir, i)
    if name == nil then break end
    if name:sub(1, #base + 1) == base .. "." and name:sub(#base + 1):match("^%.[%w]+$") then
      found[#found + 1] = name
    end
    i = i + 1
  end
  return found
end

local function removeOutboxFiles(base)
  for _, name in ipairs(outboxFiles(base)) do os.remove(outboxDir() .. SEP .. name) end
end

-- Renders the region as the master mix, with the project's current render format, into the
-- Outbox as <base>.<ext>. Render settings and the time selection are put back afterwards.
local function renderMix(entry, region)
  local dir = outboxDir()
  reaper.RecursiveCreateDirectory(dir, 0)
  local base = clipBaseName(entry)
  removeOutboxFiles(base)

  local numeric = { "RENDER_SETTINGS", "RENDER_BOUNDSFLAG", "RENDER_STARTPOS", "RENDER_ENDPOS", "RENDER_CHANNELS", "RENDER_SRATE", "RENDER_ADDTOPROJ", "RENDER_TAILFLAG", "RENDER_DITHER", "RENDER_NORMALIZE", "RENDER_NORMALIZE_TARGET", "RENDER_FADEIN", "RENDER_FADEOUT" }
  local saved = {}
  for _, key in ipairs(numeric) do saved[key] = reaper.GetSetProjectInfo(0, key, 0, false) end
  local _, savedFile = reaper.GetSetProjectInfo_String(0, "RENDER_FILE", "", false)
  local _, savedPattern = reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "", false)

  reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 0, true)   -- master mix
  reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", 0, true) -- custom time range: the region, without touching the selection
  reaper.GetSetProjectInfo(0, "RENDER_STARTPOS", region.start, true)
  reaper.GetSetProjectInfo(0, "RENDER_ENDPOS", region["end"], true)
  reaper.GetSetProjectInfo(0, "RENDER_FADEIN", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_FADEOUT", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_CHANNELS", 2, true)
  reaper.GetSetProjectInfo(0, "RENDER_SRATE", 0, true)      -- project rate
  reaper.GetSetProjectInfo(0, "RENDER_ADDTOPROJ", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_TAILFLAG", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_DITHER", 0, true)
  if CONFIG.normalize_lufs then
    -- &1 enables normalization; no mode bits = integrated LUFS; the target is an amplitude
    reaper.GetSetProjectInfo(0, "RENDER_NORMALIZE", 1, true)
    reaper.GetSetProjectInfo(0, "RENDER_NORMALIZE_TARGET", 10 ^ (CONFIG.normalize_lufs / 20), true)
  else
    reaper.GetSetProjectInfo(0, "RENDER_NORMALIZE", 0, true)
  end
  reaper.GetSetProjectInfo_String(0, "RENDER_FILE", dir, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", base, true)
  reaper.Main_OnCommand(42230, 0) -- render project using the most recent settings, auto-close

  for _, key in ipairs(numeric) do reaper.GetSetProjectInfo(0, key, saved[key], true) end
  reaper.GetSetProjectInfo_String(0, "RENDER_FILE", savedFile, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", savedPattern, true)

  local files = outboxFiles(base)
  for _, name in ipairs(files) do
    if not name:match("%.mid$") then return name end
  end
  return nil
end

-- Standard MIDI file (format 0, one track) of the clip's MIDI items, relative to the region start.
local function vlq(n)
  local bytes = { n & 0x7f }
  n = n >> 7
  while n > 0 do
    table.insert(bytes, 1, (n & 0x7f) | 0x80)
    n = n >> 7
  end
  return string.char(table.unpack(bytes))
end

local function be32(n) return string.char((n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff) end
local function be16(n) return string.char((n >> 8) & 0xff, n & 0xff) end

local function clipItems(region)
  local items = {}
  for i = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, i)
    local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    if pos < region["end"] and pos + len > region.start then items[#items + 1] = item end
  end
  return items
end

-- The instrument is chosen before Record is pressed, so its program change and bank select
-- sit in an earlier MIDI item (or earlier in this one). The last of each per channel from
-- before the region start is replayed at its start, bank MSB, then LSB, then program.
local carried = {}
local function noteInstrumentEvent(chan, msg, a, b, seconds)
  if msg == 0xC0 or (msg == 0xB0 and (a == 0 or a == 32)) then
    local key = string.format("%d:%d:%d", chan, msg, msg == 0xB0 and a or 0)
    if carried[key] == nil or seconds >= carried[key].seconds then
      local order = msg == 0xC0 and -1 or (a == 0 and -3 or -2)
      local bytes = msg == 0xC0 and string.char(msg | chan, a) or string.char(msg | chan, a, b)
      carried[key] = { seconds = seconds, bytes = bytes, order = order }
    end
  end
end

local function carryInstrumentFrom(track, regionStart, events)
  carried = {}
  for i = 0, reaper.CountTrackMediaItems(track) - 1 do
    local item = reaper.GetTrackMediaItem(track, i)
    local take = reaper.GetActiveTake(item)
    -- an item trimmed at the head still holds the events before its visible start
    if take ~= nil and reaper.TakeIsMIDI(take)
      and reaper.GetMediaItemInfo_Value(item, "D_POSITION") - reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS") < regionStart then
      do
        local _, _, ccs = reaper.MIDI_CountEvts(take)
        for j = 0, ccs - 1 do
          local _, _, muted, ppqpos, msg, chan, a, b = reaper.MIDI_GetCC(take, j)
          if not muted then
            local seconds = reaper.MIDI_GetProjTimeFromPPQPos(take, ppqpos)
            if seconds < regionStart then noteInstrumentEvent(chan, msg, a, b, seconds) end
          end
        end
      end
    end
  end
  for _, event in pairs(carried) do
    events[#events + 1] = { tick = 0, order = event.order, bytes = event.bytes }
  end
end

-- Times are taken in seconds from the project and written as ticks at one fixed tempo (the
-- tempo at the region start), so the file is exact whatever the project's tempo map does; the
-- importer places events by seconds from that same tempo.
local function exportMidi(entry, region)
  local events = {}
  local ppq = 960
  local bpm = reaper.TimeMap_GetDividedBpmAtTime(region.start)
  if bpm == nil or bpm <= 0 then bpm = 120 end
  local ticksPerSecond = ppq * bpm / 60
  local any = false
  for _, item in ipairs(clipItems(region)) do
    local take = reaper.GetActiveTake(item)
    if take ~= nil and reaper.TakeIsMIDI(take) and reaper.GetMediaItemInfo_Value(item, "B_MUTE") ~= 1 then
      any = true
      local function tickAt(ppqpos)
        local seconds = reaper.MIDI_GetProjTimeFromPPQPos(take, ppqpos) - region.start
        return math.max(0, math.floor(seconds * ticksPerSecond + 0.5))
      end
      local origin = reaper.MIDI_GetPPQPosFromProjTime(take, region.start)
      local limit = reaper.MIDI_GetPPQPosFromProjTime(take, region["end"])
      local _, notes, ccs = reaper.MIDI_CountEvts(take)
      for i = 0, notes - 1 do
        local _, _, muted, startppq, endppq, chan, pitch, vel = reaper.MIDI_GetNote(take, i)
        -- notes held across the region start are kept, starting at the region
        if not muted and endppq > origin and startppq < limit then
          events[#events + 1] = { tick = tickAt(math.max(startppq, origin)), order = 2, bytes = string.char(0x90 | chan, pitch, vel) }
          events[#events + 1] = { tick = tickAt(math.min(endppq, limit)), order = 1, bytes = string.char(0x80 | chan, pitch, 0) }
        end
      end
      for i = 0, ccs - 1 do
        local _, _, muted, ppqpos, msg, chan, a, b = reaper.MIDI_GetCC(take, i)
        if not muted and ppqpos >= origin and ppqpos < limit then
          local bytes = (msg == 0xC0 or msg == 0xD0) and string.char(msg | chan, a) or string.char(msg | chan, a, b)
          events[#events + 1] = { tick = tickAt(ppqpos), order = 0, bytes = bytes } -- controllers before the notes they shape
        end
      end
      carryInstrumentFrom(reaper.GetMediaItem_Track(item), region.start, events)
    end
  end
  if not any or #events == 0 then return nil end

  table.sort(events, function(x, y)
    if x.tick ~= y.tick then return x.tick < y.tick end
    return x.order < y.order
  end)

  local usPerQuarter = math.floor(60000000 / bpm + 0.5)
  local track = { "\0\255\81\3" .. string.char((usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff) }
  local last = 0
  for _, event in ipairs(events) do
    local tick = math.max(0, math.floor(event.tick + 0.5))
    track[#track + 1] = vlq(tick - last) .. event.bytes
    last = tick
  end
  track[#track + 1] = "\0\255\47\0"
  local body = table.concat(track)
  local data = "MThd" .. be32(6) .. be16(0) .. be16(1) .. be16(ppq) .. "MTrk" .. be32(#body) .. body

  local name = clipBaseName(entry) .. ".mid"
  reaper.RecursiveCreateDirectory(outboxDir(), 0)
  if not writeFileAtomic(outboxDir() .. SEP .. name, data) then return nil end
  return name
end

-- ---------------------------------------------------------------------------------------
-- idle-time sync: library entries follow the regions; one clip's outbox files per pass

local lastTransportChange = reaper.time_precise()
local lastKeyPress = reaper.time_precise()
local lastPlayState = nil

-- Anything that counts as the studio being in use restarts the idle clock.
markBusy = function()
  lastTransportChange = reaper.time_precise()
  lastKeyPress = reaper.time_precise()
end

local function trackIdle()
  local state = reaper.GetPlayState()
  if state ~= lastPlayState then
    lastPlayState = state
    lastTransportChange = reaper.time_precise()
  end
  if pollActivity() then lastKeyPress = reaper.time_precise() end
end

local function idleSeconds()
  return reaper.time_precise() - math.max(lastTransportChange, lastKeyPress)
end

-- Regions keyed by clip number (from the name) and by region id (stable across renames).
local function scanRegions()
  local byNumber, byId = {}, {}
  local i = 0
  while true do
    local retval, isrgn, pos, rgnend, name, idx = reaper.EnumProjectMarkers3(0, i)
    if retval == 0 then break end
    if isrgn then
      local number, label = name:match("^%a+ (%d+)%s*%-?%s*(.*)$")
      local region = { id = idx, start = pos, ["end"] = rgnend, label = number and (label or "") or name, name = name, number = number and tonumber(number) or nil }
      byId[idx] = region
      if number and byNumber[tonumber(number)] == nil then byNumber[tonumber(number)] = region end
    end
    i = i + 1
  end
  return byNumber, byId
end

local function syncLibrary()
  local lib = loadLibrary()
  if lib == nil then return nil end
  local byNumber, byId = scanRegions()
  local changed = false
  local matched = {} -- region id -> entry, so a region is claimed once

  -- entries follow their regions: by the id the watcher remembered, else by the number in
  -- the name (an older entry, or a region renumbered by hand)
  for key, entry in pairs(lib.clips) do
    local byIdMatch = entry.regionId and byId[entry.regionId] or nil
    -- an id can be reused after a deletion; trust it only when the name agrees (or has no number)
    if byIdMatch ~= nil and byIdMatch.number ~= nil and byIdMatch.number ~= entry.number then byIdMatch = nil end
    local region = byIdMatch or byNumber[entry.number]
    if region ~= nil and matched[region.id] == nil then
      matched[region.id] = entry
      if entry.regionId ~= region.id or entry.label ~= region.label or not near(entry.start, region.start) or not near(entry["end"], region["end"]) then
        entry.regionId, entry.label, entry.start, entry["end"] = region.id, region.label, region.start, region["end"]
        changed = true
      end
    else
      -- the region is gone: its entry and outbox files go with it
      if entry.render ~= json.null and entry.render ~= nil then removeOutboxFiles(entry.render.base) end
      lib.clips[key] = nil
      changed = true
    end
  end

  -- a numbered region the watcher never saw (made by hand) gets an entry
  for number, region in pairs(byNumber) do
    if matched[region.id] == nil and lib.clips[tostring(number)] == nil then
      lib.clips[tostring(number)] = { number = number, regionId = region.id, label = region.label, createdAt = localNow(),
        start = region.start, ["end"] = region["end"], starred = false, archived = false, stoppedBy = "unknown",
        sources = {}, render = json.null }
      matched[region.id] = lib.clips[tostring(number)]
      changed = true
    end
  end

  if changed then saveLibrary() end
  -- what syncOutbox renders from: each entry's own region
  local regions = {}
  for _, entry in pairs(lib.clips) do
    if entry.regionId and byId[entry.regionId] then regions[entry.number] = byId[entry.regionId] end
  end
  return regions
end

-- Renders one clip's mix and MIDI into the Outbox and records the result on its entry.
-- What a clip's outbox needs: nothing, or a render (mix and/or MIDI missing, or the region moved).
local function renderNeeded(entry)
  local render = entry.render ~= json.null and entry.render or nil
  local mixMissing = CONFIG.render and (render == nil or render.mix == json.null or not fileExists(outboxDir() .. SEP .. render.mix))
  local midiMissing = CONFIG.midi_export and (render == nil or render.midi == json.null and not render.noMidi)
  local stale = render ~= nil and (not near(render.start, entry.start) or not near(render["end"], entry["end"]))
  return mixMissing or midiMissing or stale
end

local function renderEntry(entry, region)
  local base = clipBaseName(entry)
  local render = entry.render ~= json.null and entry.render or nil
  local attempts = render and render.attempts or 0
  -- the file about to be rewritten must not be advertised as finished while REAPER writes it
  if render ~= nil and (render.mix ~= json.null or render.midi ~= json.null) then
    render.mix, render.midi = json.null, json.null
    saveLibrary()
  end
  local mix = json.null
  if CONFIG.render then mix = renderMix(entry, region) or json.null end
  local midi = json.null
  local noMidi = false
  if CONFIG.midi_export then
    midi = exportMidi(entry, region) or json.null
    noMidi = midi == json.null
  end
  local failed = CONFIG.render and mix == json.null
  entry.render = { base = base, mix = mix, midi = midi, noMidi = noMidi, renderedAt = localNow(), start = entry.start, ["end"] = entry["end"], label = entry.label,
    attempts = failed and (attempts + 1) or 0, failedAt = failed and os.time() or nil }
  saveLibrary()
  if failed then
    reaper.ShowConsoleMsg(string.format("[Studio] Render of clip %d produced no file; will retry later.\n", entry.number))
  else
    log(string.format("outbox: clip %d -> %s, %s", entry.number, tostring(mix), tostring(midi)))
  end
end

-- A short clip is rendered as soon as it is finalized, without waiting for idle.
local function renderClipNow(number)
  if not (CONFIG.render or CONFIG.midi_export) or not CONFIG.render_now_seconds then return end
  if reaper.GetPlayState() ~= 0 then return end -- a render halts the transport; the idle pass will get it
  local lib = loadLibrary()
  local entry = lib and lib.clips[tostring(number)] or nil
  if entry == nil then return end
  if entry["end"] - entry.start > CONFIG.render_now_seconds then return end
  if not renderNeeded(entry) then return end -- already done (by the idle pass, say)
  local _, byId = scanRegions()
  local region = entry.regionId and byId[entry.regionId] or nil
  if region == nil then return end
  renderEntry(entry, region)
end

-- Picks the one clip whose outbox files are missing or stale and brings them up to date.
local function syncOutbox(regions)
  if not (CONFIG.render or CONFIG.midi_export) then return end
  local lib = library
  local idle = idleSeconds()
  for _, key in ipairs((function()
    local keys = {}
    for k in pairs(lib.clips) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tonumber(a) < tonumber(b) end)
    return keys
  end)()) do
    local entry = lib.clips[key]
    local region = regions[entry.number]
    local render = entry.render ~= json.null and entry.render or nil
    local base = clipBaseName(entry)
    local duration = entry["end"] - entry.start
    local needed = idle >= (duration > CONFIG.render_long_seconds and CONFIG.render_long_idle_seconds or CONFIG.render_idle_seconds)

    if render ~= nil and render.base ~= base then
      -- relabeled: the files just move
      for _, name in ipairs(outboxFiles(render.base)) do
        local ext = name:sub(#render.base + 1)
        os.rename(outboxDir() .. SEP .. name, outboxDir() .. SEP .. base .. ext)
      end
      render.base = base
      if render.mix ~= json.null then render.mix = base .. (render.mix:match("(%.%w+)$") or "") end
      if render.midi ~= json.null then render.midi = base .. ".mid" end
      render.label = entry.label
      saveLibrary()
      log(string.format("outbox: renamed files of clip %d to '%s'", entry.number, base))
      return
    end

    -- a failed render is retried later, not every tick: 10 minutes, then 20, 40...
    local attempts = render and render.attempts or 0
    local backedOff = render ~= nil and render.failedAt ~= nil and os.time() < render.failedAt + 600 * (2 ^ math.min(math.max(attempts - 1, 0), 6))
    if renderNeeded(entry) and needed and region ~= nil and not backedOff then
      renderEntry(entry, region)
      return
    end
  end
end

-- REAPER creates the recording items before this script sees the record state, so the
-- "before" snapshot is taken while idle and only refreshed when the item count changes.
local function whileIdle()
  if not publishedIdentity then
    reaper.SetProjExtState(0, EXT_SECTION, "watcher_version", VERSION)
    reaper.SetProjExtState(0, EXT_SECTION, "watcher_hash", SCRIPT_HASH)
    publishedIdentity = true
  end
  publishProjectName()
  -- REAPER may create the items of a new recording a tick before it reports the record state;
  -- a count that has held for two idle ticks is settled and safe to snapshot
  local count = reaper.CountMediaItems(0)
  if count ~= itemsBeforeCount and reaper.GetPlayState() == 0 then
    if count == pendingCount then
      itemsBefore = snapshotItems()
      itemsBeforeCount = count
    else
      pendingCount = count
    end
  end
  trackIdle()
  if projectFile() ~= nil then
    local regions = syncLibrary()
    if regions ~= nil and reaper.GetPlayState() == 0 then syncOutbox(regions) end
  end
end

local function onRecordingStarted()
  recStart = reaper.GetPlayPosition()
  lastActivity = recStart
  firstActivity = nil
  stoppedBy = "user"
  markBusy() -- a take is activity: the idle clock starts over when it ends
  midiEventCount = reaper.MIDI_GetRecentInputEvent(0)
  log(string.format("recording started at %.2fs; %d items before", recStart, itemsBeforeCount))
end

local function whileRecording()
  pollActivity()
  local now = reaper.GetPlayPosition()
  if #CONFIG.activity == 0 then
    -- nothing to watch: only the length cap applies
    if now - recStart >= CONFIG.max_take_seconds then
      reaper.ShowConsoleMsg("[Studio] Take hit the length cap; stopping.\n")
      stoppedBy = "cap"
      reaper.Main_OnCommand(ACTION_STOP, 0)
    end
    return
  end
  if now - recStart >= CONFIG.max_take_seconds then
    reaper.ShowConsoleMsg("[Studio] Take hit the length cap; stopping.\n")
    stoppedBy = "cap"
    reaper.Main_OnCommand(ACTION_STOP, 0)
  elseif now - lastActivity >= CONFIG.silence_seconds then
    reaper.ShowConsoleMsg("[Studio] No activity; stopping.\n")
    stoppedBy = "silence"
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

-- First and last moment (project time) a recorded audio item's file has sound above
-- trim_audio_db, from REAPER's peak data; nil when it has none or the peaks are not built yet.
local function audioExtent(item)
  local take = reaper.GetActiveTake(item)
  if take == nil or reaper.TakeIsMIDI(take) then return nil, nil end
  local source = reaper.GetMediaItemTake_Source(take)
  if source == nil then return nil, nil end
  local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
  local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
  local offset = reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS")
  local channels = math.max(1, math.floor(reaper.GetMediaSourceNumChannels(source) or 1))
  local rate = 20 -- peak samples per second: 50 ms resolution is plenty for a trim
  local count = math.max(1, math.floor(len * rate))
  local buffer = reaper.new_array(count * channels * 2)
  buffer.clear()
  local got = reaper.PCM_Source_GetPeaks(source, rate, offset, channels, count, 0, buffer)
  local samples = got & 0xFFFFF
  if samples == 0 then return nil, nil end
  local threshold = 10 ^ (CONFIG.trim_audio_db / 20)
  local values = buffer.table()
  local first, last = nil, nil
  -- layout: a block of maxima then a block of minima, each channel-interleaved per sample
  for i = 1, #values do
    if math.abs(values[i]) > threshold then
      local index = ((i - 1) % (samples * channels)) // channels
      if first == nil or index < first then first = index end
      if last == nil or index > last then last = index end
    end
  end
  if first == nil then return nil, nil end
  return pos + first / rate, pos + (last + 1) / rate
end

-- Returns true once the take is finalized, false while still waiting for REAPER to commit the
-- recorded items (it can report the transport stopped a moment before they exist).
local function onRecordingFinished()
  local items = newItems()
  if #items == 0 then
    finalizeDeadline = finalizeDeadline or (reaper.time_precise() + CONFIG.finalize_timeout_seconds)
    if reaper.time_precise() < finalizeDeadline then return false end
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

  -- Sound in the recorded files widens the trim window: the activity sources may only watch
  -- the piano, and a part sung alone must survive
  local soundStart, soundEnd = firstActivity, firstActivity ~= nil and lastActivity or nil
  for _, item in ipairs(items) do
    local ok, from, to = pcall(audioExtent, item)
    if ok and from ~= nil then
      if soundStart == nil or from < soundStart then soundStart = from end
      if soundEnd == nil or to > soundEnd then soundEnd = to end
    end
  end

  -- Trim the quiet head and tail, only when something actually saw the take: with nothing
  -- detected at all there is nothing to trim against, and the audio must not be cut.
  local sawActivity = soundStart ~= nil
  if CONFIG.trim_silence and sawActivity then
    local headCut = soundStart - CONFIG.head_seconds
    if headCut > first then
      for _, item in ipairs(items) do
        local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
        local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
        local delta = headCut - pos
        if delta > 0 and delta < len then
          local take = reaper.GetActiveTake(item)
          if take ~= nil then
            reaper.SetMediaItemTakeInfo_Value(take, "D_STARTOFFS", reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS") + delta)
          end
          reaper.SetMediaItemInfo_Value(item, "D_POSITION", headCut)
          reaper.SetMediaItemInfo_Value(item, "D_LENGTH", len - delta)
        end
      end
      first = headCut
    end
    local cut = math.max(soundEnd + CONFIG.tail_seconds, first + 1)
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
  elseif CONFIG.trim_silence and stoppedBy == "silence" then
    -- the detector worked and saw nothing: keep a short stub rather than minutes of silence
    local cut = math.max(recStart + CONFIG.tail_seconds, first + 1)
    if cut < last then
      for _, item in ipairs(items) do
        local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
        local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
        if pos + len > cut then reaper.SetMediaItemInfo_Value(item, "D_LENGTH", math.max(cut - pos, 0.1)) end
      end
      last = cut
    end
  elseif CONFIG.trim_silence and #CONFIG.activity > 0 then
    reaper.ShowConsoleMsg("[Studio] No activity was detected during the take, so it was not trimmed. Check the activity setting in cs-studio-config.lua.\n")
  end

  local n = nextTakeNumber()
  local name = string.format("Clip %d - %s", n, timestampLabel())
  -- "(empty)" only when the detector was working (stopped by it) and nothing ever came
  if not sawActivity and stoppedBy == "silence" then name = name .. " (empty)" end
  local color = reaper.ColorToNative(80, 160, 255) | 0x1000000
  local regionId = reaper.AddProjectMarker2(0, true, first, last, name, -1, color)
  if projectFile() ~= nil then
    local ok, err = pcall(recordClip, n, name:match("^Clip %d+ %- (.*)$") or "", first, last, items, stoppedBy, regionId)
    if not ok then reaper.ShowConsoleMsg("[Studio] The clip was not recorded in the library: " .. tostring(err) .. "\n") end
  end

  reaper.SetEditCurPos(last + CONFIG.gap_seconds, true, false)
  reaper.UpdateArrange()
  if projectFile() ~= nil then reaper.Main_SaveProject(0, false) end
  log(string.format("created region '%s' (%.2fs - %.2fs) and saved", name, first, last))
  lastFinalized = n
  markBusy()
  return true
end

-- One pass of the loop. Split out so an error is reported and survived rather than ending
-- the script silently behind other windows.
local function step()
  local recording = isRecording()
  if not recording and not wasRecording then applyRenames() end -- never mid-take or mid-finalize
  if recording and not wasRecording then
    onRecordingStarted()
  elseif recording then
    whileRecording()
  elseif wasRecording then
    if not onRecordingFinished() then
      return -- still finalizing: stay in the "was recording" state
    end
    finalizeDeadline = nil
    -- the take's items are committed: snapshot now, so they can never count as new again
    itemsBefore = snapshotItems()
    itemsBeforeCount = reaper.CountMediaItems(0)
    pendingCount = itemsBeforeCount
    whileIdle()
    if lastFinalized ~= nil and projectFile() ~= nil then
      local ok, err = pcall(renderClipNow, lastFinalized)
      if not ok then reaper.ShowConsoleMsg("[Studio] Immediate render failed: " .. tostring(err) .. "\n") end
    end
    lastFinalized = nil
  else
    whileIdle()
  end
  wasRecording = recording
end

local lastHeartbeat = reaper.time_precise()
local lastError = nil
local ticks = 0

local function describeExtState()
  local keys = {}
  local i = 0
  while true do
    local ok, key, value = reaper.EnumProjExtState(0, EXT_SECTION, i)
    if not ok then break end
    keys[#keys + 1] = string.format("%s='%s'", key, tostring(value):sub(1, 30))
    i = i + 1
  end
  return #keys == 0 and "(none)" or table.concat(keys, ", ")
end

local function tick()
  if reloadRequested() then
    log("reloading " .. SCRIPT_PATH)
    local ok, err = pcall(dofile, SCRIPT_PATH)
    if ok then return end -- the new file's loop has taken over
    reaper.ShowConsoleMsg("[Studio] Reload failed, keeping the running watcher: " .. tostring(err) .. "\n")
  end
  ticks = ticks + 1
  if CONFIG.debug and (ticks <= 3 or ticks == 30) then
    reaper.ShowConsoleMsg(string.format("[Studio] tick %d; ext state in '%s': %s\n", ticks, EXT_SECTION, describeExtState()))
  end
  local ok, err = xpcall(step, function(e) return tostring(e) end)
  if not ok and err ~= lastError then
    reaper.ShowConsoleMsg("[Studio] error: " .. tostring(err) .. "\n")
    lastError = err
  end
  if CONFIG.debug and reaper.time_precise() - lastHeartbeat >= 10 then
    lastHeartbeat = reaper.time_precise()
    reaper.ShowConsoleMsg(string.format("[Studio] alive; %s\n", isRecording() and "recording" or "idle"))
  end
  reaper.defer(tick)
end

log(string.format("watcher %s (%s) started (%s)", VERSION, SCRIPT_HASH, os.date("%Y-%m-%d %H:%M:%S")))
if CONFIG.debug then
  for _, source in ipairs(CONFIG.activity) do
    if source.type == "midi" then
      local names = {}
      for i = 0, (reaper.GetNumMIDIInputs and reaper.GetNumMIDIInputs() or 0) - 1 do
        local ok, name = reaper.GetMIDIInputName(i, "")
        if ok and (source.device == "" or name:find(source.device, 1, true)) then names[#names + 1] = name end
      end
      log(string.format("midi activity device '%s' matches: %s", source.device or "", #names == 0 and "(none!)" or table.concat(names, ", ")))
    end
  end
end

-- Park the cursor after existing material so the first take appends cleanly.
reaper.SetEditCurPos(reaper.GetProjectLength(0) + CONFIG.gap_seconds, false, false)
tick()
