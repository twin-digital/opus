-- REAPER probe, Lua half: answers the Node half's steps and reports what REAPER does from the inside.
-- Run it from a fresh, unmodified project tab, then run the Node half (see README.md). It clears its
-- keys when done, then ends with a deliberate error to learn whether atexit runs on one.
local S = "THRASHPLAY_PROBE"
local BIG_SIZES = { 2000, 5000, 20000, 100000 }
local REPORTS = {
  "READY", "ACK", "DIRTY_LUA", "PROJKEYS", "GLOBAL", "DIRTY_WEB", "ORDER", "EMPTY", "SCRIPT", "FILES", "PROJECTS",
}

local function report(name, value)
  reaper.SetExtState(S, "R_" .. name, tostring(value), false)
end

local function enumKeys(section)
  local keys, i = {}, 0
  while true do
    local ok, key = reaper.EnumProjExtState(0, section, i)
    if not ok then break end
    keys[#keys + 1] = key
    i = i + 1
  end
  return keys
end

local function listFiles(dir)
  local names, i = {}, 0
  while true do
    local name = reaper.EnumerateFiles(dir, i)
    if not name then break end
    names[#names + 1] = name
    i = i + 1
  end
  return table.concat(names, ",") .. " (then " .. tostring(reaper.EnumerateFiles(dir, i)) .. ")"
end

-- does a Lua write to project ext state mark the project dirty?
local dirtyAtStart = reaper.IsProjectDirty(0)
reaper.SetProjExtState(0, S, "LUAWRITE", "x")
local dirtyAfterLua = reaper.IsProjectDirty(0)
reaper.SetProjExtState(0, S, "LUAWRITE", "")
report("DIRTY_LUA", "start=" .. dirtyAtStart .. " afterLuaWrite=" .. dirtyAfterLua)

local handlers = {
  CASE = function()
    report("PROJKEYS", "upper=[" .. table.concat(enumKeys(S), ",") .. "] lower=[" .. table.concat(enumKeys(S:lower()), ",") .. "]")
    report("GLOBAL", "upper=" .. reaper.GetExtState(S, "MIXED_KEY")
      .. " asWritten=" .. reaper.GetExtState(S:lower(), "mixed_Key")
      .. " lower=" .. reaper.GetExtState(S:lower(), "mixed_key"))
    report("DIRTY_WEB", reaper.IsProjectDirty(0))
  end,
  ORDER = function()
    local seen = {}
    for _, key in ipairs(enumKeys(S)) do
      if key == "ZETA" or key == "ALPHA" or key == "MIDDLE" then seen[#seen + 1] = key end
    end
    report("ORDER", table.concat(seen, ","))
  end,
  EMPTY = function()
    reaper.SetExtState(S, "E", "x", false)
    reaper.SetExtState(S, "E", "", false)
    report("EMPTY", "luaEmptyKeeps=" .. tostring(reaper.HasExtState(S, "E"))
      .. " webEmptyKeeps=" .. tostring(reaper.HasExtState(S, "WEB_EMPTY")))
    reaper.DeleteExtState(S, "E", false)
    reaper.DeleteExtState(S, "WEB_EMPTY", false)
  end,
  SCRIPT = function()
    local source = debug.getinfo(1, "S").source
    local dir = source:match("^@?(.*[/\\])") or ""
    report("SCRIPT", "version=" .. _VERSION .. " io=" .. tostring(io ~= nil) .. " source=" .. source)
    report("FILES", "slash=" .. listFiles(dir) .. " | noSlash=" .. listFiles(dir:sub(1, -2)))
    local a, pathA = reaper.EnumProjects(-1)
    local b = reaper.EnumProjects(-1)
    report("PROJECTS", "sameHandle=" .. tostring(a == b) .. " path=" .. tostring(pathA) .. " name=" .. tostring(reaper.GetProjectName(a)))
  end,
  BUSY = function()
    local start = reaper.time_precise()
    while reaper.time_precise() - start < 1.0 do end
  end,
  BIG = function()
    for _, n in ipairs(BIG_SIZES) do
      reaper.SetExtState(S, "BIG" .. n, string.rep("x", n), false)
    end
  end,
}

local function cleanup()
  reaper.SetProjExtState(0, S, "", "")
  reaper.SetProjExtState(0, S:lower(), "", "")
  for _, key in ipairs(REPORTS) do reaper.DeleteExtState(S, "R_" .. key, false) end
  for _, n in ipairs(BIG_SIZES) do reaper.DeleteExtState(S, "BIG" .. n, false) end
  reaper.DeleteExtState(S, "MIXED_KEY", false)
end

reaper.atexit(function() report("ATEXIT", "ran") end)

local last = ""
local function loop()
  local _, step = reaper.GetProjExtState(0, S, "STEP")
  if step ~= last and step ~= "" then
    last = step
    if step == "DONE" then
      cleanup()
      reaper.ShowConsoleMsg("[probe] done; ending with a deliberate error to test atexit\n")
      error("deliberate probe error: the probe finished")
    end
    local handler = handlers[step]
    if handler then handler() end
    report("ACK", step)
  end
  reaper.defer(loop)
end

reaper.DeleteExtState(S, "R_ATEXIT", false)
report("READY", "1")
reaper.ShowConsoleMsg("[probe] running; start the Node half\n")
loop()
