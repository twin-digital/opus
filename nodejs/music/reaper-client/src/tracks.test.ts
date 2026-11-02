import { afterEach, describe, expect, it } from 'vitest'
import { startWatcher } from '../test/watcher-harness.js'
import { createReaperClient, type ReaperProject } from './client.js'
import { ReaperError } from './errors.js'
import { inputChoices, type TrackInput } from './tracks.js'

let watcher: Awaited<ReturnType<typeof startWatcher>>
let stopTicking = () => undefined as unknown
afterEach(async () => {
  stopTicking()
  await watcher.sim.close()
})

const AUDIO = Array.from({ length: 8 }, (_, i) => `VM-VAIO ${String(i + 1)}`)

/**
 * The current project of a simulated REAPER with eight audio channels and two MIDI devices, one
 * of them unplugged.
 */
const connect = async (): Promise<ReaperProject> => {
  watcher = await startWatcher()
  watcher.sim.model.audioInputs = AUDIO
  watcher.sim.model.midiInputs = [
    { name: 'Digital Piano', present: true },
    { name: 'Old Keyboard', present: false },
  ]
  stopTicking = watcher.sim.run(5)
  const client = createReaperClient({ url: 'http://reaper', fetch: watcher.sim.fetch, pollIntervalMs: 5 })
  return client.currentProject()
}

const rejection = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ReaperError)
  return error as ReaperError
}

describe('listInputs', () => {
  it('lists the audio channels and the MIDI devices REAPER knows', async () => {
    const project = await connect()
    expect(await project.listInputs()).toEqual({
      audio: AUDIO.map((name, channel) => ({ channel, name })),
      midi: [
        { device: 0, name: 'Digital Piano', present: true },
        { device: 1, name: 'Old Keyboard', present: false },
      ],
    })
  })
})

describe('inputChoices', () => {
  it('offers each channel mono, even-aligned pairs stereo, and present MIDI devices', () => {
    const choices = inputChoices({
      audio: [
        { channel: 0, name: 'In 1' },
        { channel: 1, name: 'In 2' },
        { channel: 2, name: 'In 3' },
      ],
      midi: [
        { device: 0, name: 'Digital Piano', present: true },
        { device: 1, name: 'Old Keyboard', present: false },
      ],
    })
    expect(choices.map(({ group, label }) => `${group}: ${label}`)).toEqual([
      'audio: In 1',
      'audio: In 2',
      'audio: In 3',
      'audio: In 1 / In 2',
      'midi: Digital Piano (all channels)',
      'midi: All MIDI inputs (all channels)',
      'midi: Virtual MIDI keyboard',
    ])
    expect(choices[3]?.input).toEqual({ kind: 'audio', channel: 0, width: 'stereo' })
    expect(choices[4]?.input).toEqual({ kind: 'midi', device: 0, channel: 'all' })
  })
})

describe('createTrack', () => {
  it('creates a named track at the end, as one undo point', async () => {
    const project = await connect()
    const first = await project.createTrack({ name: 'Mic' })
    const second = await project.createTrack({ name: 'Piano' })
    expect(second).toMatchObject({ index: 1, name: 'Piano', armed: false, monitor: 'on' })
    expect(second.id).toMatch(/^\{[0-9A-F-]{36}\}$/)
    expect(await project.listTracks()).toEqual([first, second])
    expect(watcher.sim.model.undoPoints).toEqual(['CS Studio: create track', 'CS Studio: create track'])
  })

  it('creates a track with its input, arming and monitoring', async () => {
    const project = await connect()
    const track = await project.createTrack({
      name: 'Keys',
      input: { kind: 'audio', channel: 2, width: 'stereo' },
      armed: true,
      monitor: 'auto',
    })
    expect(track).toMatchObject({
      name: 'Keys',
      armed: true,
      monitor: 'auto',
      input: { kind: 'audio', channel: 2, width: 'stereo', raw: 1026 },
    })
  })

  it('creates a track at an index, moving the rest along', async () => {
    const project = await connect()
    await project.createTrack({ name: 'B' })
    await project.createTrack({ name: 'A', index: 0 })
    expect((await project.listTracks()).map(({ index, name }) => `${String(index)}:${name}`)).toEqual(['0:A', '1:B'])
  })

  it.each([
    ['no name', { name: undefined }, 'BAD_REQUEST'],
    ['an index past the end', { name: 'X', index: 3 }, 'BAD_REQUEST'],
    ['a monitor mode it lacks', { name: 'X', monitor: 'sometimes' }, 'BAD_REQUEST'],
    [
      'a stereo pair past the last channel',
      { name: 'X', input: { kind: 'audio', channel: 7, width: 'stereo' } },
      'INPUT_NOT_FOUND',
    ],
    [
      'a channel the device lacks',
      { name: 'X', input: { kind: 'audio', channel: 8, width: 'mono' } },
      'INPUT_NOT_FOUND',
    ],
    ['an unplugged MIDI device', { name: 'X', input: { kind: 'midi', device: 1, channel: 'all' } }, 'INPUT_NOT_FOUND'],
    [
      'a MIDI device REAPER never saw',
      { name: 'X', input: { kind: 'midi', device: 5, channel: 'all' } },
      'INPUT_NOT_FOUND',
    ],
    ['a MIDI channel past 16', { name: 'X', input: { kind: 'midi', device: 0, channel: 17 } }, 'BAD_REQUEST'],
    ['multichannel audio', { name: 'X', input: { kind: 'audio', channel: 0, width: 'multichannel' } }, 'BAD_REQUEST'],
  ])('refuses %s, creating nothing', async (_, track, code) => {
    const project = await connect()
    const error = await rejection(project.createTrack(track as never))
    expect(error.code).toBe(code)
    expect(await project.listTracks()).toEqual([])
    expect(watcher.sim.model.undoPoints).toEqual([])
  })
})

describe('updateTrack', () => {
  it('changes only the fields it is given', async () => {
    const project = await connect()
    const { id } = await project.createTrack({ name: 'Mic', input: { kind: 'audio', channel: 1, width: 'mono' } })
    const armed = await project.updateTrack({ track: id, armed: true })
    expect(armed).toMatchObject({ name: 'Mic', armed: true, monitor: 'on', input: { kind: 'audio', channel: 1 } })
    const renamed = await project.updateTrack({ track: id, name: 'Vocal', monitor: 'off' })
    expect(renamed).toMatchObject({ name: 'Vocal', armed: true, monitor: 'off' })
    expect(watcher.sim.model.undoPoints.at(-1)).toBe('CS Studio: update track')
  })

  it('rejects with TRACK_NOT_FOUND for a track the project lacks', async () => {
    const project = await connect()
    const error = await rejection(project.updateTrack({ track: '{00000000-0000-0000-0000-000000000000}', armed: true }))
    expect(error).toMatchObject({
      code: 'TRACK_NOT_FOUND',
      details: { track: '{00000000-0000-0000-0000-000000000000}' },
    })
  })

  it('names the track as its target, so a late older write is STALE', async () => {
    const project = await connect()
    const { id } = await project.createTrack({ name: 'Mic' })
    stopTicking()
    const write = (seq: number, armed: boolean) => ({
      v: 1,
      client: 'client-z',
      seq,
      generation: project.generation,
      command: 'updateTrack',
      options: { track: id, armed },
    })
    await watcher.post('B', write(2, false))
    await watcher.post('C', write(1, true))
    watcher.sim.tick()
    expect(watcher.response('C')).toMatchObject({
      ok: false,
      error: { code: 'STALE', details: { target: `track:${id}` } },
    })
    expect(watcher.sim.model.currentProject.tracks[0]?.recordArm).toBe(0)
  })
})

describe('record inputs', () => {
  it.each<[TrackInput, number]>([
    [{ kind: 'none' }, -1],
    [{ kind: 'audio', channel: 0, width: 'mono' }, 0],
    [{ kind: 'audio', channel: 5, width: 'mono' }, 5],
    [{ kind: 'audio', channel: 0, width: 'stereo' }, 1024],
    [{ kind: 'audio', channel: 1, width: 'stereo' }, 1025],
    [{ kind: 'midi', device: 0, channel: 'all' }, 4096],
    [{ kind: 'midi', device: 0, channel: 3 }, 4099],
    [{ kind: 'midi', device: 'all', channel: 'all' }, 6112],
    [{ kind: 'midi', device: 'virtual-keyboard', channel: 16 }, 6096],
  ])('writes %j as %i, and reads it back', async (input, raw) => {
    const project = await connect()
    const track = await project.createTrack({ name: 'X', input })
    expect(watcher.sim.model.currentProject.tracks[0]?.recordInput).toBe(raw)
    expect(track.input).toEqual({ ...input, raw })
  })

  it.each([
    ['multichannel', 2048],
    ['ReaRoute', 512],
    ['a stereo ReaRoute pair', 512 | 1024],
    ['an unknown flag', 8192],
    ['MIDI with an unknown flag', 4096 | 8192],
  ])('reads %s as other', async (_, raw) => {
    const project = await connect()
    await project.createTrack({ name: 'X' })
    const [simTrack] = watcher.sim.model.currentProject.tracks
    simTrack.recordInput = raw
    const [track] = await project.listTracks()
    expect(track.input).toEqual({ kind: 'other', raw })
  })
})
