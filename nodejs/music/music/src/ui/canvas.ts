import { Grid } from './grid.js'

/**
 * A Canvas is a 2D grid that components can render into.
 * This class tracks visual state and is passed to drawables as their render target.
 */
export interface Canvas<T> {
  /**
   * Returns a `Grid` containing all of the data which has been set in this canvas.
   */
  getData(): Grid<T>

  /**
   * Height of this canvas.
   */
  readonly height: number

  /**
   * Sets the value at canvas position (x, y).
   */
  set(x: number, y: number, value: T): void

  /**
   * Width of this canvas.
   */
  readonly width: number
}

/**
 * Creates a typed canvas with the specified dimensions.
 */
export const createCanvas = <T>(width: number, height: number): Canvas<T> => {
  const grid = new Grid<T>(width, height)
  return {
    getData: () => grid,
    height,
    set: (x, y, value) => {
      grid.set(x, y, value)
    },
    width,
  }
}
