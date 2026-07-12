import type {
  Note,
  PolyAfterTouch,
  ControlChange,
  Program,
  ChannelAfterTouch,
  Pitch,
  Position,
  Mtc,
  Select,
  Sysex,
} from 'easymidi'

declare module 'easymidi' {
  interface Input {
    on<E extends keyof MidiEventMap>(event: E, listener: MidiEventMap[E]): this
  }
  interface Output {
    send<E extends keyof MidiEventMap>(event: E, arg: MidiParameterMap[E]): void
  }
}

export const MidiEvents = [
  'activesense',
  'cc',
  'channel aftertouch',
  'clock',
  'continue',
  'mtc',
  'noteoff',
  'noteon',
  'pitch',
  'poly aftertouch',
  'position',
  'program',
  'reset',
  'select',
  'start',
  'stop',
  'sysex',
] as const
export type MidiEvent = (typeof MidiEvents)[number]

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type MidiEventMap = {
  'channel aftertouch': (data: ChannelAfterTouch) => void
  'poly aftertouch': (data: PolyAfterTouch) => void
  activesense: () => void
  cc: (data: ControlChange) => void
  clock: () => void
  continue: () => void
  mtc: (data: Mtc) => void
  noteoff: (data: Note) => void
  noteon: (data: Note) => void
  pitch: (data: Pitch) => void
  position: (data: Position) => void
  program: (data: Program) => void
  reset: () => void
  select: (data: Select) => void
  start: () => void
  stop: () => void
  sysex: (data: Sysex) => void
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type MidiParameterMap = {
  'channel aftertouch': ChannelAfterTouch
  'poly aftertouch': PolyAfterTouch
  activesense: undefined
  cc: ControlChange
  clock: undefined
  continue: undefined
  mtc: Mtc
  noteoff: Note
  noteon: Note
  pitch: Pitch
  position: Position
  program: Program
  reset: undefined
  select: Select
  start: undefined
  stop: undefined
  sysex: number[]
}
