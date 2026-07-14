import { describe, expect, it, vi } from 'vitest'

import type { Cell } from '../../../ui/drawable.js'
import type { RgbColor } from '../../../ui/color.js'
import { createSideColumn } from './side-column.js'

const Left: RgbColor = [127, 0, 0]
const Right: RgbColor = [96, 0, 127]

const cellAt = (cells: Cell<RgbColor>[], x: number, y: number) => cells.findLast((cell) => cell.x === x && cell.y === y)

const press = (cell: Cell<RgbColor> | undefined) => {
  cell?.onPress?.({ type: 'press', x: cell.x, y: cell.y, absoluteX: cell.x, absoluteY: cell.y })
}

const draw = (overrides: Partial<Parameters<typeof createSideColumn>[0]> = {}) =>
  createSideColumn({
    leftColor: Left,
    rightColor: Right,
    selectedSide: 'right',
    split: false,
    time: 0,
    ...overrides,
  }).draw()

describe('createSideColumn', () => {
  describe('split off', () => {
    it('lights only the selected side and the toggle, both steady in that sound color', () => {
      const cells = draw({ selectedSide: 'right', time: 1.5 }) // 1.5s is the dimmest point of a breath

      expect(cellAt(cells, 8, 0)).toBeUndefined()
      expect(cellAt(cells, 8, 1)?.value).toEqual(Right)
      expect(cellAt(cells, 8, 7)?.value).toEqual(Right)
    })

    it('puts the sound on the bottom pad when the left side carries it', () => {
      const cells = draw({ selectedSide: 'left' })

      expect(cellAt(cells, 8, 0)?.value).toEqual(Left)
      expect(cellAt(cells, 8, 1)).toBeUndefined()
      expect(cellAt(cells, 8, 7)?.value).toEqual(Left)
    })
  })

  describe('split on', () => {
    it('shows both side pads, with the unselected side steady', () => {
      const cells = draw({ split: true, selectedSide: 'right', time: 1.5 })

      expect(cellAt(cells, 8, 0)?.value).toEqual(Left)
    })

    it('breathes the selected side', () => {
      // the breath peaks at a quarter period (full color) and bottoms out at three quarters (the floor)
      const peak = draw({ split: true, selectedSide: 'right', time: 0.5 })
      const trough = draw({ split: true, selectedSide: 'right', time: 1.5 })

      expect(cellAt(peak, 8, 1)?.value).toEqual(Right)
      expect(cellAt(trough, 8, 1)?.value).toEqual(Right.map((c) => c * 0.3))
    })

    it('cycles the toggle left color, black, right color, black', () => {
      const at = (time: number) => cellAt(draw({ split: true, time }), 8, 7)?.value

      expect(at(0.5)).toEqual(Left)
      expect(at(1.1)).toEqual([0, 0, 0])
      expect(at(1.7)).toEqual(Right)
      expect(at(2.3)).toEqual([0, 0, 0])
      expect(at(2.9)).toEqual(Left) // wrapped into the next cycle
    })
  })

  it('reports side pad presses', () => {
    const onSideSelected = vi.fn()
    const cells = draw({ split: true, onSideSelected })

    press(cellAt(cells, 8, 0))
    press(cellAt(cells, 8, 1))

    expect(onSideSelected.mock.calls).toEqual([['left'], ['right']])
  })

  it('reports toggle presses', () => {
    const onSplitToggled = vi.fn()
    const cells = draw({ onSplitToggled })

    press(cellAt(cells, 8, 7))

    expect(onSplitToggled).toHaveBeenCalledTimes(1)
  })
})
