import type { RgbColor } from '../color.js'
import type { Drawable } from '../drawable.js'
import type { HoldEvent, PressEvent, ReleaseEvent } from '../input/input-event.js'

/**
 * Transforms the given Drawable such that it draws itself at a new position, defined by offsetX and
 * offsetY.
 *
 * @param drawable Drawable to translate.
 * @param x
 *    Distance to move in the horizontal direction. Positive values are to the right, and negative to the left.
 * @param y
 *    Distance to move in the vertical direction. Positive values are up, and negative are down.
 * @returns A new drawable which applies the specified positioning to the original one.
 */
export const translate = <T extends RgbColor = RgbColor>(x: number, y: number, drawable: Drawable<T>) => ({
  draw: () => {
    return drawable.draw().map((cell) => ({
      onHold:
        cell.onHold === undefined ?
          undefined
        : (event: HoldEvent) => {
            cell.onHold?.({
              ...event,
              x: event.x - x,
              y: event.y - y,
            })
          },
      onPress:
        cell.onPress === undefined ?
          undefined
        : (event: PressEvent) => {
            cell.onPress?.({
              ...event,
              x: event.x - x,
              y: event.y - y,
            })
          },
      onRelease:
        cell.onRelease === undefined ?
          undefined
        : (event: ReleaseEvent) => {
            cell.onRelease?.({
              ...event,
              x: event.x - x,
              y: event.y - y,
            })
          },
      value: cell.value,
      x: cell.x + x,
      y: cell.y + y,
    }))
  },
})
