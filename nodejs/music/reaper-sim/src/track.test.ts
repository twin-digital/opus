import { afterEach, describe, expect, it } from 'vitest'
import { ReaperSim } from './simulator.js'

let sim: ReaperSim
afterEach(async () => {
  await sim.close()
})

const out = (key: string) => sim.model.globalExtState.get('OUT', key)

describe('tracks', () => {
  it('inserts tracks at an index, each with its own GUID', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      reaper.InsertTrackAtIndex(0, true)
      reaper.InsertTrackAtIndex(1, true)
      reaper.InsertTrackAtIndex(1, true)
      local ids = {}
      for i = 0, reaper.CountTracks(0) - 1 do
        ids[#ids + 1] = reaper.GetTrackGUID(reaper.GetTrack(0, i))
      end
      reaper.SetExtState("OUT", "ids", table.concat(ids, ","), false)
      reaper.SetExtState("OUT", "missing", tostring(reaper.GetTrack(0, 9)), false)
    `)
    const { tracks } = sim.model.currentProject
    expect(out('ids')).toBe(tracks.map((track) => track.guid).join(','))
    expect(tracks[0]?.guid).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/)
    expect(new Set(sim.model.currentProject.tracks.map((track) => track.guid)).size).toBe(3)
    expect(out('missing')).toBe('nil')
  })

  it('reads and writes a track name and record settings', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      reaper.InsertTrackAtIndex(0, true)
      local track = reaper.GetTrack(0, 0)
      reaper.GetSetMediaTrackInfo_String(track, "P_NAME", "Piano", true)
      reaper.SetMediaTrackInfo_Value(track, "I_RECINPUT", 4160)
      reaper.SetMediaTrackInfo_Value(track, "I_RECARM", 1)
      reaper.SetMediaTrackInfo_Value(track, "I_RECMON", 2)
      local _, name = reaper.GetSetMediaTrackInfo_String(track, "P_NAME", "", false)
      reaper.SetExtState("OUT", "track", name .. " " .. reaper.GetMediaTrackInfo_Value(track, "I_RECINPUT")
        .. " " .. reaper.GetMediaTrackInfo_Value(track, "I_RECARM") .. " " .. reaper.GetMediaTrackInfo_Value(track, "I_RECMON"), false)
    `)
    expect(out('track')).toBe('Piano 4160 1 2')
    expect(sim.model.currentProject.tracks[0]).toMatchObject({
      name: 'Piano',
      recordInput: 4160,
      recordArm: 1,
      recordMonitor: 2,
    })
  })

  it('deletes a track', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      reaper.InsertTrackAtIndex(0, true)
      reaper.InsertTrackAtIndex(1, true)
      reaper.DeleteTrack(reaper.GetTrack(0, 0))
      reaper.SetExtState("OUT", "count", tostring(reaper.CountTracks(0)), false)
    `)
    expect(out('count')).toBe('1')
  })

  it('refuses a track parameter it does not model', async () => {
    sim = new ReaperSim()
    await expect(
      sim.loadScript(`
        reaper.InsertTrackAtIndex(0, true)
        reaper.GetMediaTrackInfo_Value(reaper.GetTrack(0, 0), "D_VOL")
      `),
    ).rejects.toThrow(/Unsupported track parameter: D_VOL/)
  })

  it('keeps each project its own tracks, and a newly opened one none', async () => {
    sim = new ReaperSim()
    sim.model.currentProject.tracks.length = 0
    await sim.loadScript(`reaper.InsertTrackAtIndex(0, true)`)
    const first = sim.model.currentProject
    sim.model.openProject('/songs/b.rpp')
    expect(sim.model.currentProject.tracks).toEqual([])
    expect(first.tracks).toHaveLength(1)
    sim.model.selectProject(first)
    sim.model.openProjectInTab('/songs/c.rpp')
    expect(first.tracks).toEqual([])
  })
})

describe('inputs', () => {
  it('reports MIDI input devices, present or not', async () => {
    sim = new ReaperSim()
    sim.model.midiInputs = [
      { name: 'Digital Piano', present: true },
      { name: 'Old Keyboard', present: false },
    ]
    await sim.loadScript(`
      local parts = {}
      for i = 0, reaper.GetNumMIDIInputs() do
        local present, name = reaper.GetMIDIInputName(i, "")
        parts[#parts + 1] = tostring(present) .. ":" .. name
      end
      reaper.SetExtState("OUT", "midi", table.concat(parts, ","), false)
    `)
    expect(out('midi')).toBe('true:Digital Piano,false:Old Keyboard,false:')
  })
})

describe('undo', () => {
  it('records an undo point when the outermost block ends', async () => {
    sim = new ReaperSim()
    await sim.loadScript(`
      reaper.Undo_BeginBlock2(0)
      reaper.Undo_BeginBlock2(0)
      reaper.Undo_EndBlock2(0, "inner", -1)
      reaper.Undo_EndBlock2(0, "CS Studio: create track", -1)
    `)
    expect(sim.model.undoPoints).toEqual(['CS Studio: create track'])
  })
})
