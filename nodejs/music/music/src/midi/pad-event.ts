import type { TypedEventEmitter } from '../typed-event-emitter.js'

export const PadEventTypes = ['pad-down', 'pad-up'] as const
export type PadEventType = (typeof PadEventTypes)[number]

/**
 * Represents an event which occurs when a user interacts with the pads on a grid-based MIDI controller.
 */
export interface BasePadEvent {
  /**
   * Type of event.
   */
  type: PadEventType

  /**
   * X-coordinate of the pad which generated the event.
   */
  x: number

  /**
   * Y-coordinate of the pad which generated the event.
   */
  y: number
}

export interface PadDownEvent extends BasePadEvent {
  type: 'pad-down'
}

export interface PadUpEvent extends BasePadEvent {
  type: 'pad-up'
}

export type PadEvent = PadDownEvent | PadUpEvent

/**
 * Object which responds to phyiscal interactions with an input device and emits appropraite 'pad-down' and
 * 'pad-up' events.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PadEventMap = {
  'pad-down': (event: PadDownEvent) => void
  'pad-up': (event: PadUpEvent) => void
}

export type PadEventEmitter = TypedEventEmitter<{
  'pad-down': (event: PadDownEvent) => void
  'pad-up': (event: PadUpEvent) => void
}>
