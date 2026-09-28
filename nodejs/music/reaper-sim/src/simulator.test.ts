import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ReaperSim } from './simulator.js'

let sim: ReaperSim
afterEach(async () => {
  await sim.close()
})

describe('scripts', () => {
  it('runs deferred functions one tick at a time', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      local n = 0
      local function loop()
        n = n + 1
        reaper.ShowConsoleMsg(n .. ";")
        reaper.defer(loop)
      end
      reaper.defer(loop)
    `)
    expect(sim.console.text).toBe('')
    sim.tick()
    sim.tick()
    expect(sim.console.text).toBe('1;2;')
  })

  it('hands out projects that round-trip as handles', async () => {
    sim = new ReaperSim()
    const song = sim.model.openProject('/songs/song.rpp')
    await sim.loadScript(`
      local proj, file = reaper.EnumProjects(-1, "")
      reaper.SetProjExtState(proj, "S", "file", file)
      reaper.SetProjExtState(0, "S", "name", reaper.GetProjectName(proj))
      local missing = reaper.EnumProjects(9, "")
      reaper.SetProjExtState(0, "S", "missing", tostring(missing))
    `)
    expect(song.extState.entries('S')).toEqual([
      ['FILE', '/songs/song.rpp'],
      ['MISSING', 'nil'],
      ['NAME', 'song.rpp'],
    ])
  })

  it('opens a project in the current tab, replacing the one there', async () => {
    sim = new ReaperSim()
    const other = sim.model.openProject('/songs/other.rpp')
    const replaced = sim.model.openProject('/songs/a.rpp')
    await sim.loadScript(`
      local before = reaper.EnumProjects(-1)
      reaper.Main_openProject("noprompt:/songs/b.rpp")
      local after, path = reaper.EnumProjects(-1)
      reaper.SetExtState("OUT", "open", tostring(before == after) .. " " .. path, false)
    `)
    expect(sim.model.globalExtState.get('OUT', 'open')).toBe('false /songs/b.rpp')
    expect(sim.model.projects.map((project) => project.path)).toEqual(['', '/songs/other.rpp', '/songs/b.rpp'])
    expect(sim.model.projects).not.toContain(replaced)
    expect(sim.model.projects).toContain(other)
  })

  it('reads project ext state case-sensitively, so web remote writes are upper-case', async () => {
    sim = new ReaperSim()
    await sim.fetch('http://reaper/_/SET/PROJEXTSTATE/thrashplay/web_key/w')
    await sim.loadScript(`
      reaper.SetProjExtState(0, "Thrashplay", "Lua_Key", "l")
      reaper.SetExtState("Thrashplay", "Global_Key", "g", false)
      local _, web = reaper.GetProjExtState(0, "Thrashplay", "Web_Key")
      local _, lua = reaper.GetProjExtState(0, "THRASHPLAY", "lua_key")
      reaper.SetExtState("OUT", "result", web .. lua .. reaper.GetExtState("thrashplay", "GLOBAL_KEY"), false)
    `)
    expect(sim.model.globalExtState.get('OUT', 'result')).toBe('wlg')
    expect(sim.model.currentProject.extState.entries('THRASHPLAY')).toEqual([
      ['LUA_KEY', 'l'],
      ['WEB_KEY', 'w'],
    ])
  })

  it('keeps a global key written empty, but deletes a project key', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      reaper.SetExtState("S", "G", "x", false)
      reaper.SetExtState("S", "G", "", false)
      reaper.SetProjExtState(0, "S", "P", "x")
      reaper.SetProjExtState(0, "S", "P", "")
      reaper.SetExtState("OUT", "result", tostring(reaper.HasExtState("S", "G")) .. " " .. tostring(reaper.EnumProjExtState(0, "S", 0)), false)
    `)
    expect(sim.model.globalExtState.get('OUT', 'result')).toBe('true false')
  })

  it('enumerates project ext state in key order until it runs out', async () => {
    sim = new ReaperSim()
    sim.model.currentProject.extState.set('THRASHPLAY', 'B', '2')
    sim.model.currentProject.extState.set('THRASHPLAY', 'A', '1')
    await sim.loadScript(`
      local seen, i = {}, 0
      while true do
        local ok, key, value = reaper.EnumProjExtState(0, "THRASHPLAY", i)
        if not ok then break end
        seen[#seen + 1] = key .. "=" .. value
        i = i + 1
      end
      reaper.SetExtState("OUT", "seen", table.concat(seen, ","), false)
    `)
    expect(sim.model.globalExtState.get('OUT', 'seen')).toBe('A=1,B=2')
  })

  it('stops a script whose deferred function throws, and reports it from the tick', async () => {
    sim = new ReaperSim()
    const script = await sim.loadScript(`reaper.defer(function() error("boom") end)`)
    expect(() => {
      sim.tick()
    }).toThrow(/boom/)
    expect(script.running).toBe(false)
    expect(String(script.error)).toMatch(/boom/)
  })

  it('journals ReaScript calls', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`reaper.SetExtState("A", "B", "c", false)`, { name: 'watcher.lua' })
    expect(sim.calls).toEqual([{ script: 'watcher.lua', fn: 'SetExtState', args: ['A', 'B', 'c', false] }])
  })

  it('reports time from the clock it was given', async () => {
    sim = new ReaperSim({ clock: () => 12.5 })
    await sim.loadScript(`reaper.SetExtState("A", "t", tostring(reaper.time_precise()), false)`)
    expect(sim.model.globalExtState.get('A', 't')).toBe('12.5')
  })
})

describe('script lifetime', () => {
  it('ends a script once nothing is deferred, running its atexit functions', async () => {
    sim = new ReaperSim()
    const script = await sim.loadScript(`
      reaper.atexit(function() reaper.SetExtState("A", "exit", "ran", false) end)
      reaper.defer(function() end)
    `)
    expect(script.running).toBe(true)
    sim.tick()
    expect(script.running).toBe(false)
    expect(sim.model.globalExtState.get('A', 'exit')).toBe('ran')
  })

  it('runs atexit functions when a script is stopped, or REAPER closes', async () => {
    sim = new ReaperSim()
    const source = `
      reaper.atexit(function() reaper.SetExtState("A", "exits", reaper.GetExtState("A", "exits") .. "x", false) end)
      local function loop() reaper.defer(loop) end
      loop()
    `
    const stopped = await sim.loadScript(source)
    await sim.loadScript(source)
    sim.stopScript(stopped)
    expect(sim.model.globalExtState.get('A', 'exits')).toBe('x')
    await sim.close()
    expect(sim.model.globalExtState.get('A', 'exits')).toBe('xx')
  })

  it('skips atexit functions when a script dies of an error', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      reaper.atexit(function() reaper.SetExtState("A", "exit", "ran", false) end)
      reaper.defer(function() error("boom") end)
    `)
    expect(() => {
      sim.tick()
    }).toThrow(/boom/)
    expect(sim.model.globalExtState.get('A', 'exit')).toBeUndefined()
  })
})

describe('script files', () => {
  it('runs a script from disk, which can load its siblings and list its directory', async () => {
    sim = new ReaperSim()
    const dir = await mkdtemp(path.join(tmpdir(), 'reaper-sim-'))
    await mkdir(path.join(dir, 'lib'))
    await writeFile(path.join(dir, 'lib', 'b.lua'), 'return "b"')
    await writeFile(path.join(dir, 'lib', 'a.lua'), 'return "a"')
    await writeFile(
      path.join(dir, 'main.lua'),
      `
        local dir = debug.getinfo(1, "S").source:match("^@?(.*[/\\\\])")
        local names, i = {}, 0
        while true do
          local name = reaper.EnumerateFiles(dir .. "lib", i)
          if not name then break end
          names[#names + 1] = name .. "=" .. assert(loadfile(dir .. "lib/" .. name))()
          i = i + 1
        end
        reaper.SetExtState("OUT", "files", table.concat(names, ","), false)
      `,
    )
    const script = await sim.loadScriptFile(path.join(dir, 'main.lua'))
    expect(script.name).toBe('main.lua')
    expect(sim.model.globalExtState.get('OUT', 'files')).toBe('a.lua=a,b.lua=b')
  })

  it('lists files mounted beside a script, with or without a trailing separator', async () => {
    sim = new ReaperSim()
    await sim.mountFile('/scripts/commands/one.lua', '')
    await sim.mountFile('/scripts/commands/deeper/two.lua', '')
    await sim.loadScript(`
      reaper.SetExtState("OUT", "list",
        tostring(reaper.EnumerateFiles("/scripts/commands/", 0)) .. "," .. tostring(reaper.EnumerateFiles("/scripts/commands", 1)), false)
    `)
    expect(sim.model.globalExtState.get('OUT', 'list')).toBe('one.lua,nil')
  })
})

describe('over HTTP', () => {
  it('carries a request from the web remote to a script and its reply back', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      local function loop()
        local ok, key, value = reaper.EnumProjExtState(0, "THRASHPLAY", 0)
        if ok then
          reaper.SetProjExtState(0, "THRASHPLAY", key, "")
          reaper.SetExtState("THRASHPLAY", "RES" .. key:sub(4), "echo:" .. value, false)
        end
        reaper.defer(loop)
      end
      reaper.defer(loop)
    `)
    const base = await sim.listen()
    await fetch(`${base}/_/SET/PROJEXTSTATE/THRASHPLAY/REQ_1/${encodeURIComponent('{"command":"ping"}')}`)
    sim.tick()
    const reply = await (await fetch(`${base}/_/GET/EXTSTATE/THRASHPLAY/RES_1`)).text()
    expect(reply).toBe('EXTSTATE\tTHRASHPLAY\tRES_1\techo:{"command":"ping"}\n')
    expect(sim.model.currentProject.extState.entries('THRASHPLAY')).toEqual([])
  })
})
