import type { RgbColor } from '../../ui/color.js'

export type MidiChannel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

export interface ChannelState {
  color: RgbColor
  id: number
  level: number
  midiChannel: MidiChannel
  muted: boolean
}
