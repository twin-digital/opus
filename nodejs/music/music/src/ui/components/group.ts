import type { RgbColor } from '../color.js'
import type { Drawable } from '../drawable.js'

/**
 * Creates a group of `Drawables`, which allows them to be composed together into higher level components.
 */
export const group = <T extends RgbColor = RgbColor>(...drawables: Drawable<T>[]): Drawable<T> => ({
  draw: () => drawables.flatMap((drawable) => drawable.draw()),
  // might need events?
})
