import type { RgbColor } from './color.js'
import type { HoldEvent, PressEvent, ReleaseEvent } from './input/input-event.js'

export interface Cell<T = unknown> {
  /**
   * Optional callback to invoke when this cell is held.
   */
  onHold?: (event: HoldEvent) => void

  /**
   * Optional callback to invoke when this cell is pressed.
   */
  onPress?: (event: PressEvent) => void

  /**
   * Optional callback to invoke when this cell is released.
   */
  onRelease?: (event: ReleaseEvent) => void

  /**
   * Value assigned to this cell.
   */
  value: T

  /**
   * X-coordinate of the cell, where lower values are on the left and higher ones on the right.
   */
  x: number

  /**
   * Y-coordinate of the cell, where lower values are on the bottom and higher ones on the top.
   */
  y: number
}

/**
 * `Drawable` interface representing components which are displayed on a canvas.
 *
 * Note that the Type parameter is deprecated.
 **/
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated, but preserved for compatibility
export interface Drawable<T extends RgbColor = RgbColor> {
  /**
   * Draw this component onto the specified canvas.
   */
  draw(): Cell<RgbColor>[]
}
