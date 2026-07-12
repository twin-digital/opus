import values from 'lodash-es/values.js'
import type { Cell } from '../drawable.js'
import { Grid } from '../grid.js'
import type { InteractionEventOfType, InteractionEventType } from './input-event.js'

export type CellHandlerKey = keyof Cell & `on${string}`

const handlerKeys: Record<InteractionEventType, CellHandlerKey> = {
  hold: 'onHold',
  press: 'onPress',
  release: 'onRelease',
} as const

const setHandler = <K extends CellHandlerKey>(
  target: Partial<Pick<Cell, CellHandlerKey>>,
  key: K,
  value: Pick<Cell, K>[K],
) => {
  target[key] = value
}

/**
 * Map associate grid coordinates and event types with the appropriate handler for that event.
 */
export class InputMap {
  constructor(private grid: Grid<Pick<Cell, CellHandlerKey>>) {}

  public static fromCells(cells: Cell[], width?: number, height?: number): InputMap {
    if (cells.length === 0) {
      return new InputMap(new Grid<Pick<Cell, CellHandlerKey>>(0, 0))
    }

    const resolvedWidth = width ?? Math.max(...cells.map((c) => c.x)) + 1
    const resolvedHeight = height ?? Math.max(...cells.map((c) => c.y)) + 1

    const grid = new Grid<Pick<Cell, CellHandlerKey>>(resolvedWidth, resolvedHeight)

    for (const cell of cells) {
      const handlers: Partial<Pick<Cell, CellHandlerKey>> = {}

      for (const handlerName of values(handlerKeys)) {
        const handler = cell[handlerName]
        if (handler !== undefined) {
          setHandler(handlers, handlerName, handler)
        }
      }

      if (Object.keys(handlers).length > 0) {
        grid.set(cell.x, cell.y, handlers)
      }
    }

    return new InputMap(grid)
  }

  /**
   * Gets the handler at (x, y) for events of the specified type, if one is set.
   */
  public getHandler<T extends InteractionEventType>(
    x: number,
    y: number,
    type: T,
  ): ((e: InteractionEventOfType<T>) => void) | undefined {
    const cell = this.grid.get(x, y)
    return cell?.[handlerKeys[type]] as (e: InteractionEventOfType<T>) => void
  }
}
