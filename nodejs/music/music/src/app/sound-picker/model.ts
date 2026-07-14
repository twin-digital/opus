import type { RgbColor } from '../../ui/color.js'

export type MidiChannel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

declare const ChannelIdBrand: unique symbol

/**
 * Identifies one of the controller's channels by its position in the channel list, counting from zero.
 *
 * Branded so it cannot be passed where a {@link MidiChannel} is expected, or vice versa. Both are numbers, but they
 * are not interchangeable: the MIDI channels backing the controller are neither zero-based nor contiguous, since 9 is
 * reserved for percussion and skipped.
 */
export type ChannelId = number & { readonly [ChannelIdBrand]: unknown }

/**
 * Builds a {@link ChannelId} from a channel's position in the channel list.
 */
export const toChannelId = (position: number) => position as ChannelId

/**
 * A channel as the UI sees it. It carries no MIDI: the grid addresses a channel by its {@link ChannelId}, and how — or
 * whether — that channel reaches the piano is the `Channel`'s business.
 */
export interface ChannelState {
  color: RgbColor
  id: ChannelId
  level: number
  muted: boolean
}

/**
 * An inclusive range of MIDI note numbers on the keyboard.
 */
export interface KeyRange {
  /**
   * Lowest note in the range.
   */
  low: number

  /**
   * Highest note in the range.
   */
  high: number
}

/**
 * One entry in the controller's keyboard routing table: notes played on the keyboard within `range` sound on the
 * channel with `channelId`.
 *
 * Routes describe *keyboard input* only. Channels are also fed programmatically (games, sequencing), and notes from
 * those sources are not range-filtered — a `Channel` plays whatever it is told.
 */
export interface KeyboardRoute {
  channelId: ChannelId

  /**
   * Keys this route applies to. When omitted, the route matches the entire keyboard.
   */
  range?: KeyRange
}
