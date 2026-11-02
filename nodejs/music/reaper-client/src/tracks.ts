import type { RequestOptions } from './client.js'

/**
 * A record input a track can be given.
 */
export type TrackInput =
  | { kind: 'none' }
  /**
   * `channel` is the 0-based input channel; a stereo input also records the next one.
   */
  | { kind: 'audio'; channel: number; width: 'mono' | 'stereo' }
  /**
   * `device` is REAPER's MIDI input device number; `channel` is 1–16.
   */
  | { kind: 'midi'; device: number | 'all' | 'virtual-keyboard'; channel: number | 'all' }

/**
 * A track's record input as REAPER has it, with REAPER's encoded value as `raw`. An input set up
 * in REAPER that a client can't give, such as multichannel or ReaRoute, reads as `other`.
 */
export type TrackInputState = (TrackInput & { raw: number }) | { kind: 'other'; raw: number }

export type TrackMonitor = 'off' | 'on' | 'auto'

export interface Track {
  /**
   * REAPER's track GUID, which stays with the track as others come, go or move.
   */
  id: string
  /**
   * The track's 0-based position, as of the response.
   */
  index: number
  name: string
  armed: boolean
  monitor: TrackMonitor
  input: TrackInputState
}

export interface InputDevices {
  /**
   * The audio device's input channels, by 0-based channel, with the driver's names.
   */
  audio: { channel: number; name: string }[]
  /**
   * The MIDI input devices REAPER knows, by device number; `present` when connected and enabled.
   */
  midi: { device: number; name: string; present: boolean }[]
}

export interface NewTrack {
  name: string
  input?: TrackInput
  armed?: boolean
  monitor?: TrackMonitor
  /**
   * Where the track goes, 0-based; after the last track when left out.
   */
  index?: number
}

/**
 * Changes to a track; fields left out stay as they are.
 */
export interface TrackChanges {
  /**
   * The track's id.
   */
  track: string
  name?: string
  input?: TrackInput
  armed?: boolean
  monitor?: TrackMonitor
}

/**
 * The track commands, on a project handle. The writes answer with the track as REAPER then has it,
 * and fail with `TRACK_NOT_FOUND` or `INPUT_NOT_FOUND` for a track or input REAPER doesn't have.
 */
export interface TrackCommands {
  listInputs(request?: RequestOptions): Promise<InputDevices>
  listTracks(request?: RequestOptions): Promise<Track[]>
  createTrack(track: NewTrack, request?: RequestOptions): Promise<Track>
  updateTrack(changes: TrackChanges, request?: RequestOptions): Promise<Track>
}

type RunCommand = <T>(command: string, options?: Record<string, unknown>, request?: RequestOptions) => Promise<T>

export const trackCommands = (runCommand: RunCommand): TrackCommands => ({
  listInputs: (request) => runCommand<InputDevices>('listInputs', {}, request),
  listTracks: async (request) => (await runCommand<{ tracks: Track[] }>('listTracks', {}, request)).tracks,
  createTrack: async (track, request) =>
    (await runCommand<{ track: Track }>('createTrack', { ...track }, request)).track,
  updateTrack: async (changes, request) =>
    (await runCommand<{ track: Track }>('updateTrack', { ...changes }, request)).track,
})

export interface InputChoice {
  group: 'audio' | 'midi'
  label: string
  input: TrackInput
}

/**
 * The inputs to offer for a track, labeled: each audio channel mono, each even-aligned pair
 * stereo, each present MIDI device on all channels, then all MIDI devices and the virtual keyboard.
 */
export const inputChoices = ({ audio, midi }: InputDevices): InputChoice[] => {
  const names = new Map(audio.map(({ channel, name }) => [channel, name]))
  return [
    ...audio.map(({ channel, name }): InputChoice => ({
      group: 'audio',
      label: name,
      input: { kind: 'audio', channel, width: 'mono' },
    })),
    ...audio.flatMap(({ channel, name }): InputChoice[] => {
      const partner = names.get(channel + 1)
      return channel % 2 === 0 && partner !== undefined ?
          [{ group: 'audio', label: `${name} / ${partner}`, input: { kind: 'audio', channel, width: 'stereo' } }]
        : []
    }),
    ...midi
      .filter(({ present }) => present)
      .map(({ device, name }): InputChoice => ({
        group: 'midi',
        label: `${name} (all channels)`,
        input: { kind: 'midi', device, channel: 'all' },
      })),
    { group: 'midi', label: 'All MIDI inputs (all channels)', input: { kind: 'midi', device: 'all', channel: 'all' } },
    {
      group: 'midi',
      label: 'Virtual MIDI keyboard',
      input: { kind: 'midi', device: 'virtual-keyboard', channel: 'all' },
    },
  ]
}
