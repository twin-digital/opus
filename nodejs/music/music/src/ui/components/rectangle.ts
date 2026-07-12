import type { RgbColor } from '../color.js'
import type { Cell, Drawable } from '../drawable.js'
import type { PressEvent, ReleaseEvent } from '../input/input-event.js'

/**
 * Creates a `Drawable` which displays a filled rectangle with the given dimensions and color.
 */
export const createRectangle = ({
  color,
  width,
  height,
  onPress,
  onRelease,
}: {
  color: RgbColor
  width: number
  height: number
  onPress?: (event: PressEvent) => void
  onRelease?: (event: ReleaseEvent) => void
}): Drawable => ({
  draw: () => {
    const results: Cell<RgbColor>[] = []
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        results.push({
          value: color,
          x,
          y,
          onPress,
          onRelease,
        })
      }
    }

    return results
  },
})
