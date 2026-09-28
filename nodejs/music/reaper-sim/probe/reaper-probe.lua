-- REAPER probe, Lua half: answers the Node half's steps and reports what REAPER does from the inside.
-- Run it from a fresh, unmodified project tab, then run the Node half (see README.md). Near the end it
-- replaces the tab's project and leaves probe-saved.rpp and probe-other.rpp beside this script. It
-- clears its keys when done, then ends with a deliberate error to learn whether atexit runs on one.
local S = "THRASHPLAY_PROBE"
local KEYS_SECTION = "THRASHPLAY_PROBE_KEYS"
local LUA_SECTION, LUA_KEY = "Probe_Lua_Section", "Probe_Lua_Key"
local BIG_SIZES = { 2000, 5000, 20000, 100000 }
local REPORTS = {
  "READY", "ACK", "DIRTY_LUA", "PROJKEYS", "GLOBAL", "LUA_CASE", "DIRTY_WEB", "KEYS", "ORDER", "EMPTY", "SCRIPT",
  "FILES", "PROJECTS", "T1", "T2", "RPP", "TABS",
}

local DIR = debug.getinfo(1, "S").source:match("^@?(.*[/\\])") or ""

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

local function contains(list, value)
  for _, item in ipairs(list) do
    if item == value then return true end
  end
  return false
end

-- does a Lua write to project ext state mark the project dirty?
local dirtyAtStart = reaper.IsProjectDirty(0)
reaper.SetProjExtState(0, S, "LUAWRITE", "x")
local dirtyAfterLua = reaper.IsProjectDirty(0)
reaper.SetProjExtState(0, S, "LUAWRITE", "")
report("DIRTY_LUA", "start=" .. dirtyAtStart .. " afterLuaWrite=" .. dirtyAfterLua)

local handlers = {
  CASE = function()
    -- what the web remote stored, as Lua sees it
    report("PROJKEYS", "upper=[" .. table.concat(enumKeys(S), ",") .. "] lower=[" .. table.concat(enumKeys(S:lower()), ",") .. "]")
    report("GLOBAL", "upper=" .. reaper.GetExtState(S, "MIXED_KEY")
      .. " asWritten=" .. reaper.GetExtState(S:lower(), "mixed_Key")
      .. " lower=" .. reaper.GetExtState(S:lower(), "mixed_key"))
    report("DIRTY_WEB", reaper.IsProjectDirty(0))
    -- mixed-case keys Lua writes, for the Node half to read in other spellings
    reaper.SetProjExtState(0, LUA_SECTION, LUA_KEY, "p")
    reaper.SetExtState(LUA_SECTION, LUA_KEY, "g", false)
    local _, projectUpper = reaper.GetProjExtState(0, LUA_SECTION:upper(), LUA_KEY:upper())
    report("LUA_CASE", "projectOtherCase=" .. projectUpper .. " globalOtherCase=" .. reaper.GetExtState(LUA_SECTION:upper(), LUA_KEY:upper()))
  end,
  KEYS = function()
    report("KEYS", table.concat(enumKeys(KEYS_SECTION), " | "))
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
      .. " webEmptyKeeps=" .. tostring(reaper.HasExtState(S, "WEB_EMPTY"))
      .. " webProjectEmptyKeeps=" .. tostring(contains(enumKeys(S), "WEB_PEMPTY")))
    reaper.DeleteExtState(S, "E", false)
    reaper.DeleteExtState(S, "WEB_EMPTY", false)
  end,
  SCRIPT = function()
    local source = debug.getinfo(1, "S").source
    report("SCRIPT", "version=" .. _VERSION .. " io=" .. tostring(io ~= nil) .. " source=" .. source)
    report("FILES", "slash=" .. listFiles(DIR) .. " | noSlash=" .. listFiles(DIR:sub(1, -2)))
    local a, pathA = reaper.EnumProjects(-1)
    local b = reaper.EnumProjects(-1)
    report("PROJECTS", "sameHandle=" .. tostring(a == b) .. " path=" .. tostring(pathA) .. " name=" .. tostring(reaper.GetProjectName(a)))
    report("T1", reaper.time_precise())
  end,
  -- a response as the watcher writes one: JSON escapes (backslashes), quotes, tab, newline and UTF-8
  ESCAPE = function()
    reaper.SetExtState(S, "LUA_ESC", '{"text":"a\\tb"}\t"q" \\ \n é 🎹', false)
  end,
  BUSY = function()
    local start = reaper.time_precise()
    while reaper.time_precise() - start < 1.0 do end
  end,
  BIG = function()
    for _, n in ipairs(BIG_SIZES) do
      reaper.SetExtState(S, "BIG" .. n, string.rep("x", n), false)
    end
    report("T2", reaper.time_precise())
  end,
  -- how a saved project file stores ext state, then what opening files in this tab does to the handle and path
  TABS = function()
    reaper.SetProjExtState(0, LUA_SECTION, LUA_KEY, "p")
    local saved = DIR .. "probe-saved.rpp"
    local rpp
    if pcall(reaper.Main_SaveProjectEx, 0, saved, 0) then
      local file = io.open(saved, "r")
      if file then
        local lines = {}
        for line in file:lines() do
          local lower = line:lower()
          if lower:find("probe_lua", 1, true) or lower:find("rpp_web", 1, true) or lower:find("<ext", 1, true) then
            lines[#lines + 1] = line:gsub("^%s+", "")
          end
        end
        file:close()
        rpp = table.concat(lines, " | ")
      else
        rpp = "(saved, but could not read " .. saved .. ")"
      end
    else
      rpp = "(Main_SaveProjectEx failed)"
    end
    report("RPP", rpp)

    local other = DIR .. "probe-other.rpp"
    local file = io.open(other, "w")
    file:write('<REAPER_PROJECT 0.1 "7.0" 0\n>\n')
    file:close()
    local before, beforePath = reaper.EnumProjects(-1)
    reaper.Main_openProject("noprompt:" .. other)
    local opened, openedPath = reaper.EnumProjects(-1)
    reaper.Main_openProject("noprompt:" .. other)
    local reopened, reopenedPath = reaper.EnumProjects(-1)
    report("TABS", "openSameHandle=" .. tostring(before == opened) .. " openPathChanged=" .. tostring(beforePath ~= openedPath)
      .. " reopenSameHandle=" .. tostring(opened == reopened) .. " reopenSamePath=" .. tostring(openedPath == reopenedPath))
  end,
}

local function cleanup()
  reaper.SetProjExtState(0, S, "", "")
  reaper.SetProjExtState(0, S:lower(), "", "")
  reaper.SetProjExtState(0, KEYS_SECTION, "", "")
  reaper.SetProjExtState(0, LUA_SECTION, "", "")
  for _, key in ipairs(REPORTS) do reaper.DeleteExtState(S, "R_" .. key, false) end
  for _, n in ipairs(BIG_SIZES) do reaper.DeleteExtState(S, "BIG" .. n, false) end
  reaper.DeleteExtState(S, "MIXED_KEY", false)
  reaper.DeleteExtState(S, "LUA_ESC", false)
  reaper.DeleteExtState(LUA_SECTION, LUA_KEY, false)
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
