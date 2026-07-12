import type { RgbColor } from '../color.js'
import type { Drawable } from '../drawable.js'
import type { PressEvent } from '../input/input-event.js'

/**
 * Creates a `Drawable` which displays a single-cell button with the specified color.
 */
export const createButton = ({
  color = [127, 127, 127],
  onPress,
}: {
  color?: RgbColor
  onPress?: (event: PressEvent) => void
}): Drawable => ({
  draw: () => [
    {
      value: color,
      x: 0,
      y: 0,
      onPress,
    },
  ],
})
