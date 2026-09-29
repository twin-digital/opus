-- Thrashplay REAPER watcher: runs the commands clients post to the current project's ext state.
--
-- Everything lives in ext-state section THRASHPLAY (REAPER stores sections and keys upper-cased):
--   request   project ext state  REQ_<id>  {"v":1,"generation":"...","command":"...","options":{...}}
--   response  global ext state   RES_<id>  {"v":1,"ok":true,"result":...}
--                                          {"v":1,"ok":false,"error":{"code":"...","message":"...","details":...}}
--   status    global ext state   WATCHER   {"v":1,"version":"...","generation":"...","heartbeat":n,"project":{...}}
--   marker    project ext state  GENERATION  the generation the watcher gave this project
--
-- A generation names the current project for as long as it stays current; any project change makes
-- a new one, and a request carrying another is refused. A tab keeps its handle when another project
-- opens in it, and unsaved projects share an empty path, so the watcher also marks each project it
-- names: a project without the current generation's marker is a new one. Commands are the modules in commands/, each
-- returning function(options, context).

local PROTOCOL = 1
local SECTION = "THRASHPLAY"
local STATUS_KEY = "WATCHER"
local INSTANCE_KEY = "WATCHER_INSTANCE"
local GENERATION_KEY = "GENERATION"
local REQUEST_PREFIX = "REQ_"
local RESPONSE_PREFIX = "RES_"
local RESPONSE_TTL = 60
local HEARTBEAT_INTERVAL = 1

local DIR = debug.getinfo(1, "S").source:match("^@?(.*[/\\])") or ""
local SEP = DIR:sub(-1) == "\\" and "\\" or "/"
local json = dofile(DIR .. "lib" .. SEP .. "json.lua")

-- tokens must differ across REAPER launches and between copies, however REAPER's Lua seeds by default
math.randomseed(math.random(1 << 30) ~ os.time(), math.random(1 << 30) ~ math.floor(reaper.time_precise() * 1000000))

local function token()
  local digits = {}
  for i = 1, 16 do
    digits[i] = string.format("%x", math.random(0, 15))
  end
  return table.concat(digits)
end

-- the installer writes manifest.json beside this script
local function readVersion()
  local file = io.open(DIR .. "manifest.json", "r")
  if not file then return "dev" end
  local ok, manifest = pcall(json.decode, file:read("a"))
  file:close()
  if ok and type(manifest) == "table" and type(manifest.version) == "string" then
    return manifest.version
  end
  return "dev"
end

local function loadCommands()
  local commands, dir, i = {}, DIR .. "commands" .. SEP, 0
  while true do
    local file = reaper.EnumerateFiles(dir, i)
    if not file then break end
    local name = file:match("^(.+)%.lua$")
    if name then
      local chunk, loadError = loadfile(dir .. file)
      local ok, run = false, loadError
      if chunk then ok, run = pcall(chunk) end
      if ok and type(run) == "function" then
        commands[name] = { run = run }
      else
        commands[name] = { loadError = ok and "module did not return a function" or tostring(run) }
      end
    end
    i = i + 1
  end
  return commands
end

local VERSION = readVersion()
local commands = loadCommands()

local instance = token()
reaper.SetExtState(SECTION, INSTANCE_KEY, instance, false)
local function superseded()
  return reaper.GetExtState(SECTION, INSTANCE_KEY) ~= instance
end

local current = { heartbeat = 0, lastBeat = reaper.time_precise() }
local expiries = {}

local function projectInfo()
  return { name = reaper.GetProjectName(current.project), path = current.path }
end

local function publishStatus()
  reaper.SetExtState(SECTION, STATUS_KEY, json.encode({
    v = PROTOCOL,
    version = VERSION,
    generation = current.generation,
    heartbeat = current.heartbeat,
    project = projectInfo(),
  }), false)
end

-- ext-state writes don't mark a project changed, so the marker costs the user nothing
local function projectChanged()
  local project, path = reaper.EnumProjects(-1)
  local _, marker = reaper.GetProjExtState(0, SECTION, GENERATION_KEY)
  if project == current.project and path == current.path and marker == current.generation then return false end
  current.project, current.path, current.generation = project, path, token()
  reaper.SetProjExtState(0, SECTION, GENERATION_KEY, current.generation)
  return true
end

local function failure(code, message, details)
  return { ok = false, error = { code = code, message = message, details = details } }
end

local function handle(raw)
  local decoded, request = pcall(json.decode, raw)
  if not decoded or type(request) ~= "table" then
    return failure("BAD_REQUEST", "request is not a JSON object")
  end
  if request.v ~= PROTOCOL then
    return failure("BAD_REQUEST", "unsupported protocol version: " .. tostring(request.v))
  end
  if type(request.generation) ~= "string" or type(request.command) ~= "string" then
    return failure("BAD_REQUEST", "request needs a generation and a command")
  end
  if request.options ~= nil and type(request.options) ~= "table" then
    return failure("BAD_REQUEST", "options must be an object")
  end
  if request.generation ~= current.generation then
    return failure("WRONG_PROJECT", "the current project changed", { project = projectInfo() })
  end

  local command = commands[request.command]
  if not command then
    return failure("UNKNOWN_COMMAND", "unknown command: " .. request.command)
  end
  if command.loadError then
    return failure("FAILED", "command failed to load: " .. command.loadError)
  end
  local ran, result = pcall(command.run, request.options or {}, { project = current.project })
  if not ran then
    return failure("FAILED", tostring(result))
  end
  return { ok = true, result = result }
end

local function respond(id, response)
  response.v = PROTOCOL
  local encoded, value = pcall(json.encode, response)
  if not encoded then
    value = json.encode(failure("FAILED", "result is not JSON-encodable: " .. tostring(value)))
  end
  reaper.SetExtState(SECTION, RESPONSE_PREFIX .. id, value, false)
  expiries[id] = reaper.time_precise() + RESPONSE_TTL
end

-- each request is deleted before it runs, so none runs twice
local function processInbox()
  local ids, i = {}, 0
  while true do
    local ok, key = reaper.EnumProjExtState(0, SECTION, i)
    if not ok then break end
    if key:sub(1, #REQUEST_PREFIX) == REQUEST_PREFIX then
      ids[#ids + 1] = key:sub(#REQUEST_PREFIX + 1)
    end
    i = i + 1
  end
  table.sort(ids)
  for _, id in ipairs(ids) do
    local _, raw = reaper.GetProjExtState(0, SECTION, REQUEST_PREFIX .. id)
    -- empty when the client withdrew it after this tick listed it
    if raw ~= "" then
      reaper.SetProjExtState(0, SECTION, REQUEST_PREFIX .. id, "")
      respond(id, handle(raw))
    end
  end
end

-- responses nobody collected
local function expireResponses(now)
  for id, expiry in pairs(expiries) do
    if now >= expiry then
      reaper.DeleteExtState(SECTION, RESPONSE_PREFIX .. id, false)
      expiries[id] = nil
    end
  end
end

local function tick()
  if superseded() then return end
  local now = reaper.time_precise()
  local changed = projectChanged()
  if now - current.lastBeat >= HEARTBEAT_INTERVAL then
    current.heartbeat, current.lastBeat, changed = current.heartbeat + 1, now, true
  end
  if changed then publishStatus() end
  processInbox()
  expireResponses(now)
  reaper.defer(tick)
end

reaper.atexit(function()
  if not superseded() then
    reaper.DeleteExtState(SECTION, STATUS_KEY, false)
    reaper.DeleteExtState(SECTION, INSTANCE_KEY, false)
  end
end)

tick()
