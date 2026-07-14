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
