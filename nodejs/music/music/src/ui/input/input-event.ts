export const InteractionEventTypes = ['hold', 'press', 'release'] as const
export type InteractionEventType = (typeof InteractionEventTypes)[number]

/**
 * Events generated when the UI receives input from the user
 */
export interface BaseInteractionEvent {
  /**
   * Absolute x-coordinate of where the presss occurred, without any local offset.
   */
  absoluteX: number

  /**
   * Absolute y-coordinate of where the presss occurred, without any local offset.
   */
  absoluteY: number

  /**
   * Specific type of event.
   */
  type: InteractionEventType

  /**
   * Local x-coordinate of where the press occurred.
   */
  x: number

  /**
   * Local y-coordinate of where the press occurred.
   */
  y: number
}

export interface HoldEvent extends BaseInteractionEvent {
  /**
   * Time, in millseconds, at which the pad was first pressed.
   */
  pressedAt: number

  type: 'hold'
}

export interface PressEvent extends BaseInteractionEvent {
  type: 'press'
}

export interface ReleaseEvent extends BaseInteractionEvent {
  type: 'release'
}

export type InteractionEvent = HoldEvent | PressEvent | ReleaseEvent

export type InteractionEventOfType<T extends InteractionEventType> = InteractionEvent & {
  type: T
}
