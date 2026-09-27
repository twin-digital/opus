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
      ['file', '/songs/song.rpp'],
      ['name', 'song.rpp'],
      ['missing', 'nil'],
    ])
  })

  it('reads project ext state case-sensitively, so web remote writes are upper-case', async () => {
    sim = new ReaperSim()
    await sim.fetch('http://reaper/_/SET/PROJEXTSTATE/csst/key/v')
    await sim.loadScript(`
      local _, lower = reaper.GetProjExtState(0, "csst", "key")
      local size, upper = reaper.GetProjExtState(0, "CSST", "KEY")
      reaper.SetExtState("OUT", "result", "[" .. lower .. "][" .. upper .. "]" .. size, false)
    `)
    expect(sim.model.globalExtState.get('OUT', 'result')).toBe('[][v]1')
  })

  it('enumerates project ext state until it runs out', async () => {
    sim = new ReaperSim()
    sim.model.currentProject.extState.set('CSST', 'A', '1')
    sim.model.currentProject.extState.set('CSST', 'B', '2')
    await sim.loadScript(`
      local seen, i = {}, 0
      while true do
        local ok, key, value = reaper.EnumProjExtState(0, "CSST", i)
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

describe('over HTTP', () => {
  it('carries a request from the web remote to a script and its reply back', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      local function loop()
        local ok, key, value = reaper.EnumProjExtState(0, "CSST", 0)
        if ok then
          reaper.SetProjExtState(0, "CSST", key, "")
          reaper.SetExtState("CSST", "RES" .. key:sub(4), "echo:" .. value, false)
        end
        reaper.defer(loop)
      end
      reaper.defer(loop)
    `)
    const base = await sim.listen()
    await fetch(`${base}/_/SET/PROJEXTSTATE/CSST/REQ_1/${encodeURIComponent('{"command":"ping"}')}`)
    sim.tick()
    const reply = await (await fetch(`${base}/_/GET/EXTSTATE/CSST/RES_1`)).text()
    expect(reply).toBe('EXTSTATE\tCSST\tRES_1\techo:{"command":"ping"}\n')
    expect(sim.model.currentProject.extState.entries('CSST')).toEqual([])
  })
})
