-- CS Studio: import clips into the open project.
--
-- Runs in REAPER on the producer machine. Reads the manifests the studio writes into the
-- Inbox and imports every eligible clip: named in the studio (not the default "Clip N"),
-- at least min_seconds long, and not imported into this project before. Each clip's stems
-- are copied from the studio's projects share into this project's media folder, and it
-- becomes one folder track: stems and MIDI as children, all at time zero and trimmed to
-- the clip. Every folder but the first is muted, so the project does not play everything
-- at once. What was imported is recorded in the project, so a clip comes in once; deleting
-- its tracks does not bring it back.
--
-- Paths and the length threshold come from cs-studio-import-config.lua beside this file
-- (written by the installer):
--   return { inbox = "D:\\...\\Studio", projects = "P:\\", min_seconds = 30, watch_seconds = 300 }
-- Missing paths are asked for once and remembered; the threshold can be changed per run.
--
-- Two ways to run it. As an action, it lists what is eligible and asks. Loaded by
-- cs-studio-import-watch.lua it stays running and, every watch_seconds while the transport
-- is stopped, imports new eligible clips without asking, into a project that has had at
-- least one on-demand import (that first import is the opt-in).

local VERSION = "2026-09-24.4"
local EXT_SECTION = "CSStudioImport"

local SCRIPT_PATH = debug.getinfo(1, "S").source:sub(2)
local SCRIPT_DIR = SCRIPT_PATH:match("^(.*)[/\\]") or "."
local SEP = package.config:sub(1, 1)

-- ---------------------------------------------------------------------------------------
-- json (objects, arrays, strings, numbers, booleans, null), enough for the manifest

local json = { null = setmetatable({}, { __tostring = function() return "null" end }) }

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
        pos = pos + 1
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
-- files

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

local function fileSize(path)
  local f = io.open(path, "rb")
  if f == nil then return nil end
  local size = f:seek("end")
  f:close()
  return size
end

-- Copies in chunks, checking every write and the final size; a failed or short copy leaves
-- nothing behind.
local function copyFile(from, to)
  local src = io.open(from, "rb")
  if src == nil then return false end
  local dst = io.open(to, "wb")
  if dst == nil then src:close(); return false end
  local ok = true
  while true do
    local chunk = src:read(1 << 20)
    if chunk == nil then break end
    if not dst:write(chunk) then ok = false; break end
  end
  src:close()
  if not dst:close() then ok = false end -- a full disk can surface on the final flush
  if ok and fileSize(to) ~= fileSize(from) then ok = false end
  if not ok then os.remove(to) end
  return ok
end

local function listDirs(path)
  local dirs = {}
  local i = 0
  while true do
    local name = reaper.EnumerateSubdirectories(path, i)
    if name == nil then break end
    dirs[#dirs + 1] = name
    i = i + 1
  end
  return dirs
end

local function safeName(text)
  return (text:gsub('[<>:"/\\|?*%c]', " "):gsub("%s+", " "):gsub("^%s+", ""):gsub("[%s.]+$", ""))
end

-- ---------------------------------------------------------------------------------------
-- config: file beside the script, else asked once and kept in REAPER's ext state

local function loadConfig()
  local config = {}
  local ok, fromFile = pcall(dofile, SCRIPT_DIR .. SEP .. "cs-studio-import-config.lua")
  if ok and type(fromFile) == "table" then
    for k, v in pairs(fromFile) do config[k] = v end
  end
  for _, key in ipairs({ "inbox", "projects" }) do
    if config[key] == nil or config[key] == "" then
      config[key] = reaper.GetExtState(EXT_SECTION, key)
    end
  end
  if config.inbox == "" or config.projects == "" then
    local ok2, csv = reaper.GetUserInputs("CS Studio import: paths", 2,
      "Inbox folder (has the manifests),Studio projects share (root),extrawidth=300",
      (config.inbox or "") .. "," .. (config.projects or ""))
    if not ok2 then return nil end
    config.inbox, config.projects = csv:match("^(.-),(.*)$")
    reaper.SetExtState(EXT_SECTION, "inbox", config.inbox, true)
    reaper.SetExtState(EXT_SECTION, "projects", config.projects, true)
  end
  config.inbox = config.inbox:gsub("[/\\]+$", "")
  config.projects = config.projects:gsub("[/\\]+$", "")
  config.min_seconds = tonumber(config.min_seconds) or 30
  config.watch_seconds = tonumber(config.watch_seconds) or 300
  return config
end

-- ---------------------------------------------------------------------------------------
-- clips: every manifest under the Inbox, one folder per project

local function loadClips(inbox)
  local clips = {}
  for _, dir in ipairs(listDirs(inbox)) do
    local text = readFile(inbox .. SEP .. dir .. SEP .. "manifest.json")
    if text ~= nil then
      local ok, manifest = pcall(json.decode, text)
      if ok and type(manifest) == "table" and type(manifest.clips) == "table" then
        for _, entry in pairs(manifest.clips) do
          if entry.render ~= nil and entry.render ~= json.null then
            clips[#clips + 1] = {
              project = manifest.project or {},
              inboxDir = inbox .. SEP .. dir,
              entry = entry,
            }
          end
        end
      end
    end
  end
  table.sort(clips, function(a, b)
    if a.project.name ~= b.project.name then return (a.project.name or "") < (b.project.name or "") end
    return a.entry.number < b.entry.number
  end)
  return clips
end

local function isNamed(clip)
  local label = clip.entry.label or ""
  return label ~= "" and not label:match("^%a%a%a %d%d?, %d%d?:%d%d [AP]M")
end

local function clipTitle(clip)
  if isNamed(clip) then return clip.entry.label end
  return string.format("Clip %d", clip.entry.number)
end

local function clipLength(clip)
  return (clip.entry["end"] or 0) - (clip.entry.start or 0)
end

-- Imports are recorded in the song project itself, keyed by studio project folder and clip
-- number, so a clip is brought in once no matter what happens to its tracks afterwards.
local function importKey(clip)
  return string.format("imported:%s:%d", clip.project.folder or clip.project.name or "?", clip.entry.number)
end

local function wasImported(clip)
  local _, value = reaper.GetProjExtState(0, EXT_SECTION, importKey(clip))
  return value ~= nil and value ~= ""
end

local function recordImport(clip)
  reaper.SetProjExtState(0, EXT_SECTION, importKey(clip), os.date("%Y-%m-%dT%H:%M:%S"))
end

local function describe(clip)
  local starred = clip.entry.starred and " *" or ""
  return string.format("%s%s  (%s, %s, %.0fs)", clipTitle(clip), starred, clip.project.name or "?",
    (clip.entry.createdAt or ""):sub(1, 10), clipLength(clip))
end

local function eligibleClips(clips)
  local named = {}
  for _, clip in ipairs(clips) do
    if isNamed(clip) and not wasImported(clip) then named[#named + 1] = clip end
  end
  return named
end

-- Lists what is eligible and asks for the length threshold; the answer can also narrow the
-- import to some list numbers. Returns the clips to import.
local function chooseClips(clips, config)
  local named = eligibleClips(clips)
  reaper.ClearConsole()
  if #named == 0 then
    reaper.ShowConsoleMsg("CS Studio: no new named clips in the Inbox.\n")
    return {}
  end
  reaper.ShowConsoleMsg("CS Studio: named clips not yet in this project:\n\n")
  for i, clip in ipairs(named) do
    local short = clipLength(clip) < config.min_seconds and "   (shorter than the threshold)" or ""
    reaper.ShowConsoleMsg(string.format("%3d  %s%s\n", i, describe(clip), short))
  end
  reaper.ShowConsoleMsg("\nEverything at least as long as the threshold is imported. Leave the list blank for all of them.\n")
  local ok, answer = reaper.GetUserInputs("CS Studio import", 2,
    "Minimum length (seconds):,Only list numbers (blank = all):,extrawidth=200",
    tostring(config.min_seconds) .. ",")
  if not ok then return {} end
  local minText, only = answer:match("^(.-),(.*)$")
  local minSeconds = tonumber(minText) or config.min_seconds
  local wanted = nil
  if only ~= nil and only:match("%S") then
    wanted = {}
    for token in only:gmatch("[^,%s]+") do
      local index = tonumber(token)
      if index ~= nil then wanted[index] = true end
    end
  end
  local chosen = {}
  for i, clip in ipairs(named) do
    if clipLength(clip) >= minSeconds and (wanted == nil or wanted[i]) then chosen[#chosen + 1] = clip end
  end
  return chosen
end

-- ---------------------------------------------------------------------------------------
-- MIDI: reads the format-0 file the watcher writes and recreates its notes and controllers

local function be32(s, i) return (s:byte(i) << 24) | (s:byte(i + 1) << 16) | (s:byte(i + 2) << 8) | s:byte(i + 3) end
local function be16(s, i) return (s:byte(i) << 8) | s:byte(i + 1) end

-- Returns { ppq, usPerQuarter, events }: ticks plus the tempo they were written against, so the
-- events can be placed in seconds regardless of the song project's tempo.
local function parseMidi(data)
  if data == nil or data:sub(1, 4) ~= "MThd" then return nil end
  local ppq = be16(data, 13)
  local pos = 9 + be32(data, 5)
  if data:sub(pos, pos + 3) ~= "MTrk" then return nil end
  local len = be32(data, pos + 4)
  local i, stop = pos + 8, pos + 8 + len
  if stop > #data + 1 then error("truncated MIDI file") end
  local function vlq()
    local n = 0
    while true do
      local b = data:byte(i)
      if b == nil then error("truncated MIDI file") end
      i = i + 1
      n = (n << 7) | (b & 0x7f)
      if b < 0x80 then return n end
    end
  end
  local tick = 0
  local events = {}
  local running = nil
  local usPerQuarter = 500000 -- 120 BPM unless the file says otherwise
  while i < stop do
    tick = tick + vlq()
    local status = data:byte(i)
    if status == nil then error("truncated MIDI file") end
    if status == 0xFF then
      local kind = data:byte(i + 1)
      i = i + 2
      local length = vlq()
      if kind == 0x51 and length == 3 then
        usPerQuarter = (data:byte(i) << 16) | (data:byte(i + 1) << 8) | data:byte(i + 2)
      end
      i = i + length
    elseif status == 0xF0 or status == 0xF7 then
      i = i + 1
      i = i + vlq()
    else
      if status < 0x80 then
        if running == nil then error("MIDI running status without a status byte") end
        status = running
      else
        i = i + 1
      end
      running = status
      local kind = status & 0xF0
      local a, b = data:byte(i), data:byte(i + 1)
      if kind == 0xC0 or kind == 0xD0 then
        if a == nil then error("truncated MIDI file") end
        events[#events + 1] = { tick = tick, status = status, a = a }
        i = i + 1
      else
        if a == nil or b == nil then error("truncated MIDI file") end
        events[#events + 1] = { tick = tick, status = status, a = a, b = b }
        i = i + 2
      end
    end
  end
  return { ppq = ppq, usPerQuarter = usPerQuarter, events = events }
end

local function insertMidiItem(track, midi, lengthSeconds)
  local item = reaper.CreateNewMIDIItemInProj(track, 0, lengthSeconds, false)
  local take = reaper.GetActiveTake(item)
  -- ticks -> seconds at the file's own tempo -> this project's PPQ (the item sits at 0)
  local secondsPerTick = midi.usPerQuarter / 1e6 / midi.ppq
  local open = {}
  for _, e in ipairs(midi.events) do
    local kind = e.status & 0xF0
    local chan = e.status & 0x0F
    local ppqpos = reaper.MIDI_GetPPQPosFromProjTime(take, e.tick * secondsPerTick)
    local key = chan * 128 + e.a
    if kind == 0x90 and e.b > 0 then
      open[key] = open[key] or {}
      table.insert(open[key], { ppq = ppqpos, vel = e.b })
    elseif kind == 0x80 or (kind == 0x90 and e.b == 0) then
      local started = open[key] and table.remove(open[key], 1) or nil
      if started ~= nil then
        reaper.MIDI_InsertNote(take, false, false, started.ppq, ppqpos, chan, e.a, started.vel, true)
      end
    elseif kind == 0xB0 or kind == 0xC0 or kind == 0xD0 or kind == 0xE0 then
      reaper.MIDI_InsertCC(take, false, false, ppqpos, kind, chan, e.a, e.b or 0)
    end
  end
  reaper.MIDI_Sort(take)
  return item
end

-- ---------------------------------------------------------------------------------------
-- the import

local function projectMediaDir()
  local _, file = reaper.EnumProjects(-1, "")
  if file == nil or file == "" then return nil end
  local dir = reaper.GetProjectPath("")
  if dir == nil or dir == "" then dir = file:match("^(.*)[/\\]") end
  return dir
end

-- Where a clip's files should be, on the share and in the Inbox; nil path = cannot be resolved.
local function stemSource(clip, config, source)
  local file = source.file
  if file == nil or file == json.null then return nil end
  if file:match("^[/\\]") or file:match("^%a:") then return nil end -- absolute on the studio side
  return config.projects .. SEP .. (clip.project.folder or "") .. SEP .. file:gsub("/", SEP)
end

local function midiSource(clip)
  local render = clip.entry.render
  if type(render) ~= "table" or render.midi == nil or render.midi == json.null then return nil end
  return clip.inboxDir .. SEP .. render.midi
end

-- Everything a clip needs must be reachable before a single track is made.
local function validateClip(clip, config)
  local missing = {}
  for _, source in ipairs(clip.entry.sources or {}) do
    if source.file ~= nil and source.file ~= json.null then
      local from = stemSource(clip, config, source)
      if from == nil or fileSize(from) == nil then missing[#missing + 1] = tostring(from or source.file) end
    end
  end
  local midi = midiSource(clip)
  if midi ~= nil and fileSize(midi) == nil then missing[#missing + 1] = midi end
  local anything = midi ~= nil
  for _, source in ipairs(clip.entry.sources or {}) do
    if source.file ~= nil and source.file ~= json.null then anything = true end
  end
  if not anything then missing[#missing + 1] = "no stems and no MIDI" end
  return missing
end

-- Whether any item in the open project plays this file.
local function fileInUse(path)
  for i = 0, reaper.CountMediaItems(0) - 1 do
    local take = reaper.GetActiveTake(reaper.GetMediaItem(0, i))
    if take ~= nil and not reaper.TakeIsMIDI(take) then
      local source = reaper.GetMediaItemTake_Source(take)
      if source ~= nil and reaper.GetMediaSourceFileName(source, "") == path then return true end
    end
  end
  return false
end

-- Tracks inserted at the end of a project inherit any folder still open there; close it first.
local function closeOpenFolders()
  local count = reaper.CountTracks(0)
  if count == 0 then return end
  local depth = 0
  for i = 0, count - 1 do
    depth = depth + reaper.GetMediaTrackInfo_Value(reaper.GetTrack(0, i), "I_FOLDERDEPTH")
  end
  if depth > 0 then
    local last = reaper.GetTrack(0, count - 1)
    local own = reaper.GetMediaTrackInfo_Value(last, "I_FOLDERDEPTH")
    reaper.SetMediaTrackInfo_Value(last, "I_FOLDERDEPTH", own - depth)
  end
end

local function insertTrack(index, name)
  reaper.InsertTrackAtIndex(index, false)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", name, true)
  return track
end

local function importClip(clip, config, mediaDir, mute)
  local entry = clip.entry
  local start = entry.start or 0
  local length = (entry["end"] or 0) - start
  local title = string.format("%04d - %s", entry.number, clipTitle(clip))
  -- the studio project folder keeps two projects' "0012 - Twinkle" apart
  local clipMedia = mediaDir .. SEP .. safeName(clip.project.folder or clip.project.name or "studio") .. SEP .. safeName(title)
  reaper.RecursiveCreateDirectory(clipMedia, 0)

  local index = reaper.CountTracks(0)
  closeOpenFolders()
  local made = {}   -- tracks inserted, for cleanup on failure
  local copied = {} -- files copied, likewise
  local function fail(message)
    error(string.format("%s: %s", title, message), 0)
  end

  -- Whatever goes wrong below, the clip's tracks and copied files are taken back out.
  local ok, err = pcall(function()
  local parent = insertTrack(index, title)
  made[#made + 1] = parent
  local children = {}

  for _, source in ipairs(entry.sources or {}) do
    local from = stemSource(clip, config, source)
    if from ~= nil then
      local to = clipMedia .. SEP .. (from:match("[^/\\]+$") or "stem.wav")
      local existing = fileSize(to)
      if existing == nil then
        if not copyFile(from, to) then fail("could not copy " .. from) end
        copied[#copied + 1] = to
      elseif existing ~= fileSize(from) then
        -- a different file of the same name: a leftover from an interrupted copy can be
        -- replaced, a file some track still plays must not be
        if fileInUse(to) then fail("would overwrite " .. to .. ", which a track uses") end
        if not copyFile(from, to) then fail("could not copy " .. from) end
        copied[#copied + 1] = to
      end
      -- an identical file is a copy from an earlier import of this clip (its tracks since
      -- deleted, or the project closed unsaved); reuse it
      local track = insertTrack(index + #children + 1, source.track or "Stem")
      made[#made + 1] = track
      local item = reaper.AddMediaItemToTrack(track)
      local take = reaper.AddTakeToMediaItem(item)
      local pcm = reaper.PCM_Source_CreateFromFile(to)
      if pcm == nil then fail("REAPER could not open " .. to) end
      reaper.SetMediaItemTake_Source(take, pcm)
      -- the stem's file begins where its item began in the studio; place it so the clip's
      -- own start is at 0, whether that is inside the file or after the file began
      local itemStart = source.itemStart or start
      local lead = itemStart - start
      if lead >= 0 then
        reaper.SetMediaItemInfo_Value(item, "D_POSITION", lead)
        reaper.SetMediaItemInfo_Value(item, "D_LENGTH", math.max(0, length - lead))
        reaper.SetMediaItemTakeInfo_Value(take, "D_STARTOFFS", 0)
      else
        reaper.SetMediaItemInfo_Value(item, "D_POSITION", 0)
        reaper.SetMediaItemInfo_Value(item, "D_LENGTH", length)
        reaper.SetMediaItemTakeInfo_Value(take, "D_STARTOFFS", -lead)
      end
      children[#children + 1] = track
    end
  end

  local midiPath = midiSource(clip)
  if midiPath ~= nil then
    local ok, midi = pcall(parseMidi, readFile(midiPath))
    if not ok or midi == nil then fail("could not read the MIDI file " .. midiPath) end
    local track = insertTrack(index + #children + 1, "MIDI")
    made[#made + 1] = track
    insertMidiItem(track, midi, length)
    children[#children + 1] = track
  end

  if #children == 0 then fail("nothing to import") end
  reaper.SetMediaTrackInfo_Value(parent, "I_FOLDERDEPTH", 1)
  reaper.SetMediaTrackInfo_Value(children[#children], "I_FOLDERDEPTH", -1)
  reaper.SetMediaTrackInfo_Value(parent, "B_MUTE", mute and 1 or 0)
  reaper.ShowConsoleMsg(string.format("  imported %s (%d tracks)\n", title, #children))
  end)
  if not ok then
    for i = #made, 1, -1 do reaper.DeleteTrack(made[i]) end
    for _, path in ipairs(copied) do os.remove(path) end
    error(tostring(err), 0)
  end
end

-- Imports what validates, one clip at a time; a clip that fails is undone and left unrecorded.
local function importAll(chosen, config, mediaDir, save)
  local ready = {}
  for _, clip in ipairs(chosen) do
    local missing = validateClip(clip, config)
    if #missing == 0 then
      ready[#ready + 1] = clip
    else
      reaper.ShowConsoleMsg(string.format("  skipped %s, not all files are here yet: %s\n", clipTitle(clip), table.concat(missing, ", ")))
    end
  end
  if #ready == 0 then return 0 end

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)
  local first = reaper.CountTracks(0) == 0
  local imported = 0
  for _, clip in ipairs(ready) do
    local ok, err = pcall(importClip, clip, config, mediaDir, not (first and imported == 0))
    if ok then
      recordImport(clip)
      imported = imported + 1
    else
      reaper.ShowConsoleMsg("  failed: " .. tostring(err) .. "\n")
    end
  end
  reaper.PreventUIRefresh(-1)
  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("CS Studio: import clips", -1)
  if imported > 0 then
    reaper.SetProjExtState(0, EXT_SECTION, "auto_import", "1") -- this project keeps receiving new clips
    if save then reaper.Main_SaveProject(0, false) end
  end
  return imported
end

local function onDemand()
  local mediaDir = projectMediaDir()
  if mediaDir == nil then
    reaper.MB("Save the project first: the clips' stems are copied into its media folder.", "CS Studio import", 0)
    return
  end
  local config = loadConfig()
  if config == nil then return end
  local clips = loadClips(config.inbox)
  if #clips == 0 then
    reaper.MB("No clips found under " .. config.inbox .. ". Is the Inbox syncing?", "CS Studio import", 0)
    return
  end
  local chosen = chooseClips(clips, config)
  if #chosen == 0 then return end
  local imported = importAll(chosen, config, mediaDir, true)
  reaper.ShowConsoleMsg(string.format("\n%d clip(s) imported.\n", imported))
end

-- Continuous mode: every watch_seconds, with the transport stopped and the open project
-- opted in by an earlier on-demand import, bring in whatever became eligible since. It never
-- saves: the tracks arrive as an undoable edit, and the record of them is saved when you save.
local function watchPass()
  local mediaDir = projectMediaDir()
  if mediaDir == nil or reaper.GetPlayState() ~= 0 then return end
  local _, optedIn = reaper.GetProjExtState(0, EXT_SECTION, "auto_import")
  if optedIn ~= "1" then return end
  local config = loadConfig()
  if config == nil then return end
  local chosen = {}
  for _, clip in ipairs(eligibleClips(loadClips(config.inbox))) do
    if clipLength(clip) >= config.min_seconds then chosen[#chosen + 1] = clip end
  end
  if #chosen == 0 then return end
  reaper.ShowConsoleMsg(string.format("CS Studio: importing %d new clip(s)\n", #chosen))
  importAll(chosen, config, mediaDir, false) -- saving is yours to do; the import is undoable
end

local function watch()
  local config = loadConfig()
  local interval = config and config.watch_seconds or 300
  local nextPass = reaper.time_precise() -- first pass right away
  local function tick()
    if reaper.time_precise() >= nextPass then
      nextPass = reaper.time_precise() + interval
      local ok, err = pcall(watchPass)
      if not ok then reaper.ShowConsoleMsg("CS Studio import: " .. tostring(err) .. "\n") end
    end
    reaper.defer(tick)
  end
  tick()
end

if CS_STUDIO_IMPORT_MODE == "watch" then
  watch()
else
  onDemand()
end
