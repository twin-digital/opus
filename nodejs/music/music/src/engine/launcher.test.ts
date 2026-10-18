import { describe, expect, it, vi } from 'vitest'

import type { Cell } from '../ui/drawable.js'
import type { RgbColor } from '../ui/color.js'
import type { Program } from './program.js'
import { createLauncher } from './launcher.js'
import { InputMap } from '../ui/input/input-map.js'

const press = (cell: Cell<RgbColor> | undefined) => {
  expect(cell, 'expected a pressable cell at that position').toBeDefined()
  cell?.onPress?.({ type: 'press', x: cell.x, y: cell.y, absoluteX: cell.x, absoluteY: cell.y })
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLauncher', () => {
  it('exposes a program to the render loop only between initialize() and shutdown()', async () => {
    let resolveInitialize: () => void = () => undefined
    const firstDraw = vi.fn((): Cell<RgbColor>[] => [])
    const first: Program = {
      getDrawable: () => ({ draw: firstDraw }),
      shutdown: () => undefined,
    }
    const secondDraw = vi.fn((): Cell<RgbColor>[] => [])
    const secondUpdate = vi.fn()
    const second: Program = {
      getDrawable: () => ({ draw: secondDraw }),
      initialize: () =>
        new Promise<void>((resolve) => {
          resolveInitialize = resolve
        }),
      update: secondUpdate,
    }

    const launcher = await createLauncher([() => first, () => second])

    // the "next program" button in the launcher chrome
    const nextButton = launcher
      .getDrawable()
      .draw()
      .findLast((cell) => cell.x === 1 && cell.y === 8)
    press(nextButton)
    await flush() // let the transition reach the second program's pending initialize()

    // the second program is initializing: frames keep rendering, but must not reach it
    launcher.getDrawable().draw()
    launcher.update?.(0.1)
    expect(secondDraw).not.toHaveBeenCalled()
    expect(secondUpdate).not.toHaveBeenCalled()

    resolveInitialize()
    await flush()

    launcher.getDrawable().draw()
    launcher.update?.(0.1)
    expect(secondDraw).toHaveBeenCalled()
    expect(secondUpdate).toHaveBeenCalled()
  })
  it('draws overlays above the active program and updates them every frame', async () => {
    const program: Program = {
      getDrawable: () => ({ draw: () => [{ value: [1, 1, 1] as RgbColor, x: 7, y: 8 }] }),
    }
    const overlayUpdate = vi.fn()
    const overlayPress = vi.fn()
    const overlay: Program = {
      getDrawable: () => ({ draw: () => [{ value: [9, 9, 9] as RgbColor, x: 7, y: 8, onPress: overlayPress }] }),
      update: overlayUpdate,
    }

    const launcher = await createLauncher([() => program], { overlays: [overlay] })

    // last cell at a pad wins when the engine composites, so the overlay must come after the program
    const cells = launcher.getDrawable().draw()
    expect(cells.findLast((cell) => cell.x === 7 && cell.y === 8)?.value).toEqual([9, 9, 9])

    // and the engine's input map must dispatch to the overlay's handler at that pad
    const handler = InputMap.fromCells(cells).getHandler(7, 8, 'press')
    handler?.({ type: 'press', x: 7, y: 8, absoluteX: 7, absoluteY: 8 })
    expect(overlayPress).toHaveBeenCalledOnce()

    launcher.update?.(0.1)
    expect(overlayUpdate).toHaveBeenCalledWith(0.1)
  })
})
