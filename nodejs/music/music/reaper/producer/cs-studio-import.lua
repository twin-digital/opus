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

local VERSION = "2026-09-24.2"
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

local function copyFile(from, to)
  local data = readFile(from)
  if data == nil then return false end
  return writeFile(to, data)
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

local function parseMidi(data)
  if data == nil or data:sub(1, 4) ~= "MThd" then return nil end
  local ppq = be16(data, 13)
  local pos = 9 + be32(data, 5)
  if data:sub(pos, pos + 3) ~= "MTrk" then return nil end
  local len = be32(data, pos + 4)
  local i, stop = pos + 8, pos + 8 + len
  local tick = 0
  local events = {}
  local running = nil
  while i < stop do
    local delta = 0
    while true do
      local b = data:byte(i)
      i = i + 1
      delta = (delta << 7) | (b & 0x7f)
      if b < 0x80 then break end
    end
    tick = tick + delta
    local status = data:byte(i)
    if status == 0xFF then
      local length = data:byte(i + 2)
      i = i + 3 + length
    elseif status == 0xF0 or status == 0xF7 then
      local length = data:byte(i + 1)
      i = i + 2 + length
    else
      if status < 0x80 then status = running else i = i + 1 end
      running = status
      local kind = status & 0xF0
      if kind == 0xC0 or kind == 0xD0 then
        events[#events + 1] = { tick = tick, status = status, a = data:byte(i) }
        i = i + 1
      else
        events[#events + 1] = { tick = tick, status = status, a = data:byte(i), b = data:byte(i + 1) }
        i = i + 2
      end
    end
  end
  return { ppq = ppq, events = events }
end

local function insertMidiItem(track, midi, lengthSeconds)
  local item = reaper.CreateNewMIDIItemInProj(track, 0, lengthSeconds, false)
  local take = reaper.GetActiveTake(item)
  local qnPerTick = 1 / midi.ppq
  local open = {}
  for _, e in ipairs(midi.events) do
    local kind = e.status & 0xF0
    local chan = e.status & 0x0F
    local ppqpos = reaper.MIDI_GetPPQPosFromProjQN(take, e.tick * qnPerTick)
    if kind == 0x90 and e.b > 0 then
      open[chan * 128 + e.a] = { ppq = ppqpos, vel = e.b }
    elseif kind == 0x80 or (kind == 0x90 and e.b == 0) then
      local started = open[chan * 128 + e.a]
      if started ~= nil then
        reaper.MIDI_InsertNote(take, false, false, started.ppq, ppqpos, chan, e.a, started.vel, true)
        open[chan * 128 + e.a] = nil
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

local function insertTrack(index, name)
  reaper.InsertTrackAtIndex(index, false)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", name, true)
  return track
end

local function importClip(clip, config, mediaDir, mute)
  local entry = clip.entry
  local length = (entry["end"] or 0) - (entry.start or 0)
  local title = string.format("%04d - %s", entry.number, clipTitle(clip))
  local folderName = safeName(title)
  local clipMedia = mediaDir .. SEP .. folderName
  reaper.RecursiveCreateDirectory(clipMedia, 0)

  local index = reaper.CountTracks(0)
  local parent = insertTrack(index, title)
  local children = {}

  for _, source in ipairs(entry.sources or {}) do
    if source.file ~= nil and source.file ~= json.null then
      local from = config.projects .. SEP .. (clip.project.folder or "") .. SEP .. source.file:gsub("/", SEP)
      local to = clipMedia .. SEP .. (source.file:match("[^/\\]+$") or "stem.wav")
      if copyFile(from, to) then
        local track = insertTrack(index + #children + 1, source.track or "Stem")
        local item = reaper.AddMediaItemToTrack(track)
        local take = reaper.AddTakeToMediaItem(item)
        local pcm = reaper.PCM_Source_CreateFromFile(to)
        reaper.SetMediaItemTake_Source(take, pcm)
        reaper.SetMediaItemInfo_Value(item, "D_POSITION", 0)
        reaper.SetMediaItemInfo_Value(item, "D_LENGTH", length)
        reaper.SetMediaItemTakeInfo_Value(take, "D_STARTOFFS", math.max(0, (entry.start or 0) - (source.itemStart or entry.start or 0)))
        children[#children + 1] = track
      else
        reaper.ShowConsoleMsg(string.format("  could not copy %s\n", from))
      end
    end
  end

  local render = entry.render
  if type(render) == "table" and render.midi ~= nil and render.midi ~= json.null then
    local midi = parseMidi(readFile(clip.inboxDir .. SEP .. render.midi))
    if midi ~= nil then
      local track = insertTrack(index + #children + 1, "MIDI")
      insertMidiItem(track, midi, length)
      children[#children + 1] = track
    end
  end

  if #children == 0 then
    reaper.DeleteTrack(parent)
    reaper.ShowConsoleMsg(string.format("  nothing imported for %s\n", title))
    return false
  end
  reaper.SetMediaTrackInfo_Value(parent, "I_FOLDERDEPTH", 1)
  reaper.SetMediaTrackInfo_Value(children[#children], "I_FOLDERDEPTH", -1)
  reaper.SetMediaTrackInfo_Value(parent, "B_MUTE", mute and 1 or 0)
  reaper.ShowConsoleMsg(string.format("  imported %s (%d tracks)\n", title, #children))
  return true
end

local function importAll(chosen, config, mediaDir)
  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)
  local first = reaper.CountTracks(0) == 0
  local imported = 0
  for _, clip in ipairs(chosen) do
    if importClip(clip, config, mediaDir, not (first and imported == 0)) then
      recordImport(clip)
      imported = imported + 1
    end
  end
  reaper.PreventUIRefresh(-1)
  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("CS Studio: import clips", -1)
  if imported > 0 then
    reaper.SetProjExtState(0, EXT_SECTION, "auto_import", "1") -- this project keeps receiving new clips
    reaper.Main_SaveProject(0, false)
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
  local imported = importAll(chosen, config, mediaDir)
  reaper.ShowConsoleMsg(string.format("\n%d clip(s) imported.\n", imported))
end

-- Continuous mode: every watch_seconds, with the transport stopped and the open project
-- opted in by an earlier on-demand import, bring in whatever became eligible since.
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
  importAll(chosen, config, mediaDir)
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
