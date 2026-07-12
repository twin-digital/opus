import type { IdentityResponseMessage } from '../../../midi/sysex-message-parser.js'
import { type LaunchpadCommand, type Mode } from './commands/index.js'

export interface LaunchpadEvent {
  /**
   * Type of event
   */
  eventType: string
}

/**
 * Event generated when a universal SysEx "Get Identity Response" message is received.
 */
export interface IdentityResponseEvent extends LaunchpadEvent {
  eventType: 'identity-response'

  /**
   * Parsed identity response.
   */
  message: IdentityResponseMessage
}

export interface MidiStatsEvent extends LaunchpadEvent {
  eventType: 'midi-stats'

  /**
   * Number of bytes received over MIDI during the interval.
   */
  bytesReceived: number

  /**
   * Number of bytes sent over MIDI during the interval.
   */
  bytesSent: number

  /**
   * Length of time over which these stats were collected.
   */
  interval: number
}

/**
 * Event emitted when the Launchpad changes between 'live' mode and 'programmer' mode.
 */
export interface ModeChangedEvent extends LaunchpadEvent {
  /**
   * Type of event.
   */
  eventType: 'mode-changed'

  /**
   * The new mode.
   */
  mode: Mode
}

export interface PadEvent extends LaunchpadEvent {
  /**
   * Type of event
   */
  eventType: 'pad-down' | 'pad-long-press' | 'pad-up'

  /**
   * X position of the associated pad. Zero is the leftmost column, and eight is the rightmost. Values 0-7 are assigned
   * to pads in the main grid.
   */
  x: number

  /**
   * Y position of the associated pad. Zero is the bottom row, and eight is the topmost. Values 0-7 are assigned
   * to pads in the main grid.
   */
  y: number
}

export interface PadDownEvent extends PadEvent {
  eventType: 'pad-down'
}

export interface PadUpEvent extends PadEvent {
  eventType: 'pad-up'
}

export interface PadLongPressEvent extends PadEvent {
  /**
   * How long the pad was held down before it was released.
   */
  duration: number

  eventType: 'pad-long-press'
}

/**
 * Event generated when a Launchpad command generates readback data.
 */
export interface ReadbackEvent extends LaunchpadEvent {
  /**
   * Name of the command which generated the readback data.
   */
  command: LaunchpadCommand

  /**
   * Type of event.
   */
  eventType: 'readback'

  /**
   * Data which was sent as the readback payload.
   */
  data: number[]
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type LaunchpadEventMap = {
  'identity-response': (event: IdentityResponseEvent) => void
  'midi-stats': (event: MidiStatsEvent) => void
  'mode-changed': (event: ModeChangedEvent) => void
  'pad-down': (event: PadDownEvent) => void
  'pad-long-press': (event: PadLongPressEvent) => void
  'pad-up': (event: PadUpEvent) => void
  readback: (event: ReadbackEvent) => void
}
