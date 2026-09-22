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

  -- The Outbox: a rendered mix and a MIDI file per clip, plus a manifest, kept in sync with
  -- the project while the studio is idle (nothing playing or recording, no key pressed and
  -- no transport change for render_idle_seconds). "~" is the home folder. Clips longer than
  -- render_long_seconds wait for render_long_idle_seconds of idle instead.
  outbox = "~/Music/Studio Outbox",
  render = true,
  midi_export = true,
  render_idle_seconds = 30,
  render_long_seconds = 10 * 60,
  render_long_idle_seconds = 5 * 60,
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

local VERSION = "2026-09-24.1" -- bump when changing the script, so the console shows which copy runs
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

local wasRecording = false
local itemsBefore = {}
local itemsBeforeCount = -1
local recStart = 0
local lastActivity = 0
local midiEventCount = 0
local finalizeDeadline = nil
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
  clearRequest("reload")
  if isRecording() then return false end -- finish the take first; the app asks again
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
    reaper.Main_SaveProject(0, false)
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
    return string.format("%.4f", value):gsub("0+$", ""):gsub("%.$", "")
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
  f:write(data)
  f:close()
  return true
end

local function projectFile()
  local _, file = reaper.EnumProjects(-1, "")
  if file == nil or file == "" then return nil end
  return file
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
  return (text:gsub('[<>:"/\\|?*%c]', " "):gsub("%s+", " "):gsub("^%s+", ""):gsub("[%s.]+$", ""))
end

-- Local time with its UTC offset ("2026-09-22T18:41:07-05:00"): a real timestamp, whose first
-- ten characters are also the local calendar day the file names sort by.
local function localNow()
  local offset = os.date("%z") -- "-0500"
  return os.date("%Y-%m-%dT%H:%M:%S") .. offset:sub(1, 3) .. ":" .. offset:sub(4, 5)
end

-- ---------------------------------------------------------------------------------------
-- clip library: one JSON document per project, beside the project file, and the manifest
-- exported to the Outbox

local LIBRARY_FILE = "cs-studio-library.json"
local library = nil -- loaded lazily once the project has a file

local function libraryPath()
  local dir = projectDir()
  return dir and (dir .. SEP .. LIBRARY_FILE) or nil
end

local function loadLibrary()
  if library ~= nil then return library end
  local path = libraryPath()
  if path == nil then return nil end
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
  library.project = { name = currentProjectName(), file = (projectFile() or ""):match("[^/\\]+$"), updatedAt = localNow() }
  writeFile(path, json.encode(library, "  ") .. "\n")
  if CONFIG.render or CONFIG.midi_export then
    reaper.RecursiveCreateDirectory(outboxDir(), 0)
    writeFile(manifestPath(), json.encode(library, "  ") .. "\n")
  end
end

local function clipEntry(number)
  local lib = loadLibrary()
  return lib and lib.clips[tostring(number)] or nil
end

-- Called at finalize with the new items, so the entry knows its source files and how it ended.
local function recordClip(number, label, first, last, items, stoppedBy)
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
    sources[#sources + 1] = { track = trackName, file = file }
  end
  lib.clips[tostring(number)] = {
    number = number,
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

  local numeric = { "RENDER_SETTINGS", "RENDER_BOUNDSFLAG", "RENDER_CHANNELS", "RENDER_SRATE", "RENDER_ADDTOPROJ", "RENDER_TAILFLAG", "RENDER_DITHER" }
  local saved = {}
  for _, key in ipairs(numeric) do saved[key] = reaper.GetSetProjectInfo(0, key, 0, false) end
  local _, savedFile = reaper.GetSetProjectInfo_String(0, "RENDER_FILE", "", false)
  local _, savedPattern = reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "", false)
  local selStart, selEnd = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)

  reaper.GetSet_LoopTimeRange(true, false, region.start, region["end"], false)
  reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 0, true)   -- master mix
  reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", 2, true) -- time selection
  reaper.GetSetProjectInfo(0, "RENDER_CHANNELS", 2, true)
  reaper.GetSetProjectInfo(0, "RENDER_SRATE", 0, true)      -- project rate
  reaper.GetSetProjectInfo(0, "RENDER_ADDTOPROJ", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_TAILFLAG", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_DITHER", 0, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_FILE", dir, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", base, true)
  reaper.Main_OnCommand(42230, 0) -- render project using the most recent settings, auto-close

  for _, key in ipairs(numeric) do reaper.GetSetProjectInfo(0, key, saved[key], true) end
  reaper.GetSetProjectInfo_String(0, "RENDER_FILE", savedFile, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", savedPattern, true)
  reaper.GetSet_LoopTimeRange(true, false, selStart, selEnd, false)

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

local function exportMidi(entry, region)
  local events = {}
  local ppq = nil
  for _, item in ipairs(clipItems(region)) do
    local take = reaper.GetActiveTake(item)
    if take ~= nil and reaper.TakeIsMIDI(take) then
      ppq = ppq or math.floor(reaper.MIDI_GetPPQPosFromProjQN(take, 1) - reaper.MIDI_GetPPQPosFromProjQN(take, 0) + 0.5)
      local origin = reaper.MIDI_GetPPQPosFromProjTime(take, region.start)
      local limit = reaper.MIDI_GetPPQPosFromProjTime(take, region["end"])
      local _, notes, ccs = reaper.MIDI_CountEvts(take)
      for i = 0, notes - 1 do
        local _, _, muted, startppq, endppq, chan, pitch, vel = reaper.MIDI_GetNote(take, i)
        if not muted and startppq >= origin and startppq < limit then
          events[#events + 1] = { tick = startppq - origin, order = 1, bytes = string.char(0x90 | chan, pitch, vel) }
          events[#events + 1] = { tick = math.min(endppq, limit) - origin, order = 0, bytes = string.char(0x80 | chan, pitch, 0) }
        end
      end
      for i = 0, ccs - 1 do
        local _, _, muted, ppqpos, msg, chan, a, b = reaper.MIDI_GetCC(take, i)
        if not muted and ppqpos >= origin and ppqpos < limit then
          local bytes = (msg == 0xC0 or msg == 0xD0) and string.char(msg | chan, a) or string.char(msg | chan, a, b)
          events[#events + 1] = { tick = ppqpos - origin, order = 2, bytes = bytes }
        end
      end
    end
  end
  if ppq == nil or #events == 0 then return nil end

  table.sort(events, function(x, y)
    if x.tick ~= y.tick then return x.tick < y.tick end
    return x.order < y.order
  end)

  local bpm = reaper.Master_GetTempo()
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
  if not writeFile(outboxDir() .. SEP .. name, data) then return nil end
  return name
end

-- ---------------------------------------------------------------------------------------
-- idle-time sync: library entries follow the regions; one clip's outbox files per pass

local lastTransportChange = reaper.time_precise()
local lastKeyPress = reaper.time_precise()
local lastPlayState = nil

local function trackIdle()
  local state = reaper.GetPlayState()
  if state ~= lastPlayState then
    lastPlayState = state
    lastTransportChange = reaper.time_precise()
  end
  local before = lastActivity
  pollActivity()
  if lastActivity ~= before then lastKeyPress = reaper.time_precise() end
end

local function idleSeconds()
  return reaper.time_precise() - math.max(lastTransportChange, lastKeyPress)
end

local function regionsByNumber()
  local found = {}
  local i = 0
  while true do
    local retval, isrgn, pos, rgnend, name, idx = reaper.EnumProjectMarkers3(0, i)
    if retval == 0 then break end
    if isrgn then
      local number, label = name:match("^%a+ (%d+)%s*%-?%s*(.*)$")
      if number then found[tonumber(number)] = { id = idx, start = pos, ["end"] = rgnend, label = label or "", name = name } end
    end
    i = i + 1
  end
  return found
end

local function syncLibrary()
  local lib = loadLibrary()
  if lib == nil then return nil end
  local regions = regionsByNumber()
  local changed = false

  -- entries follow their regions; a region the watcher never saw (made by hand) gets an entry too
  for number, region in pairs(regions) do
    local key = tostring(number)
    local entry = lib.clips[key]
    if entry == nil then
      entry = { number = number, label = region.label, createdAt = localNow(), start = region.start, ["end"] = region["end"],
        starred = false, archived = false, stoppedBy = "unknown", sources = {}, render = json.null }
      lib.clips[key] = entry
      changed = true
    elseif entry.label ~= region.label or entry.start ~= region.start or entry["end"] ~= region["end"] then
      entry.label, entry.start, entry["end"] = region.label, region.start, region["end"]
      changed = true
    end
  end

  -- a deleted region takes its entry and outbox files with it
  for key, entry in pairs(lib.clips) do
    if regions[entry.number] == nil then
      if entry.render ~= json.null and entry.render ~= nil then removeOutboxFiles(entry.render.base) end
      lib.clips[key] = nil
      changed = true
    end
  end

  if changed then saveLibrary() end
  return regions
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

    local mixMissing = CONFIG.render and (render == nil or render.mix == json.null or not fileExists(outboxDir() .. SEP .. render.mix))
    local midiMissing = CONFIG.midi_export and (render == nil or render.midi == json.null and not render.noMidi)
    local stale = render ~= nil and (render.start ~= entry.start or render["end"] ~= entry["end"])
    if (mixMissing or midiMissing or stale) and needed and region ~= nil then
      local mix = json.null
      if CONFIG.render then mix = renderMix(entry, region) or json.null end
      local midi = json.null
      local noMidi = false
      if CONFIG.midi_export then
        midi = exportMidi(entry, region) or json.null
        noMidi = midi == json.null
      end
      entry.render = { base = base, mix = mix, midi = midi, noMidi = noMidi, renderedAt = localNow(), start = entry.start, ["end"] = entry["end"], label = entry.label }
      saveLibrary()
      log(string.format("outbox: clip %d -> %s, %s", entry.number, tostring(mix), tostring(midi)))
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
  local count = reaper.CountMediaItems(0)
  if count ~= itemsBeforeCount then
    itemsBefore = snapshotItems()
    itemsBeforeCount = count
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
  stoppedBy = "user"
  midiEventCount = reaper.MIDI_GetRecentInputEvent(0)
  log(string.format("recording started at %.2fs; %d items before", recStart, itemsBeforeCount))
end

local function whileRecording()
  pollActivity()
  local now = reaper.GetPlayPosition()
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
  if projectFile() ~= nil then
    recordClip(n, name:match("^Clip %d+ %- (.*)$") or "", first, last, items, stoppedBy)
  end

  reaper.SetEditCurPos(last + CONFIG.gap_seconds, true, false)
  reaper.UpdateArrange()
  reaper.Main_SaveProject(0, false)
  log(string.format("created region '%s' (%.2fs - %.2fs) and saved", name, first, last))
  return true
end

-- One pass of the loop. Split out so an error is reported and survived rather than ending
-- the script silently behind other windows.
local function step()
  applyRenames()
  local recording = isRecording()
  if recording and not wasRecording then
    onRecordingStarted()
  elseif recording then
    whileRecording()
  elseif wasRecording then
    if not onRecordingFinished() then
      return -- still finalizing: stay in the "was recording" state
    end
    finalizeDeadline = nil
    itemsBeforeCount = -1
    whileIdle() -- re-snapshot now, so the take just finished can never count as new again
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
    dofile(SCRIPT_PATH)
    return
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

-- Park the cursor after existing material so the first take appends cleanly.
reaper.SetEditCurPos(reaper.GetProjectLength(0) + CONFIG.gap_seconds, false, false)
tick()
