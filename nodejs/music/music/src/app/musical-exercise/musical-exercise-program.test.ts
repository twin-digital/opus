import { describe, expect, it, vi } from 'vitest'

import type { MidiDevice } from '../../midi/midi-device.js'
import type { MidiScheduler } from '../../midi/sequencing.js'
import type { Cell } from '../../ui/drawable.js'
import type { RgbColor } from '../../ui/color.js'
import { EarTrainingGames } from './games.js'
import { createMusicalExerciseProgram } from './musical-exercise-program.js'

vi.mock('../speak.js', () => ({ speak: vi.fn() }))
// the native MIDI stack can't load in unit tests; nothing here ever constructs a device
vi.mock('easymidi', () => ({
  Input: vi.fn(),
  Output: vi.fn(),
  getInputs: () => [],
  getOutputs: () => [],
}))
import { speak } from '../speak.js'

// the program only hands these to states that touch them on challenge playback/response,
// which these tests never advance far enough to reach
const stubOptions = {
  device: {} as unknown as MidiDevice,
  midi: {} as unknown as MidiScheduler,
}

const cellAt = (cells: Cell<RgbColor>[], x: number, y: number) => cells.findLast((cell) => cell.x === x && cell.y === y)

const press = (cell: Cell<RgbColor> | undefined) => {
  cell?.onPress?.({ type: 'press', x: cell.x, y: cell.y, absoluteX: cell.x, absoluteY: cell.y })
}

const SelectedColor: RgbColor = [0, 127, 0]

describe('createMusicalExerciseProgram', () => {
  const draw = (program: ReturnType<typeof createMusicalExerciseProgram>) => program.getDrawable().draw()

  it('lights every game on the right edge, with the active game highlighted', () => {
    const program = createMusicalExerciseProgram(stubOptions)
    void program.initialize?.()

    const cells = draw(program)
    EarTrainingGames.forEach((game, index) => {
      const expected = index === 0 ? SelectedColor : game.color
      expect(cellAt(cells, 8, 7 - index)?.value, game.name).toEqual(expected)
    })
  })

  it("shows the active game's identity color across the playfield top row", () => {
    const program = createMusicalExerciseProgram(stubOptions)
    void program.initialize?.()

    const cells = draw(program)
    for (let x = 0; x < 8; x++) {
      expect(cellAt(cells, x, 7)?.value).toEqual(EarTrainingGames[0].color)
    }
  })

  it('switches games on selector press: highlight moves, identity re-themes, name is spoken', () => {
    const program = createMusicalExerciseProgram(stubOptions)
    void program.initialize?.()
    vi.mocked(speak).mockClear()

    press(cellAt(draw(program), 8, 6))

    const cells = draw(program)
    expect(cellAt(cells, 8, 6)?.value).toEqual(SelectedColor)
    expect(cellAt(cells, 8, 7)?.value).toEqual(EarTrainingGames[0].color)
    expect(cellAt(cells, 0, 7)?.value).toEqual(EarTrainingGames[1].color)
    expect(speak).toHaveBeenCalledExactlyOnceWith(EarTrainingGames[1].name)
  })

  it('ignores presses on the already-active game', () => {
    const program = createMusicalExerciseProgram(stubOptions)
    void program.initialize?.()
    vi.mocked(speak).mockClear()

    press(cellAt(draw(program), 8, 7))

    expect(speak).not.toHaveBeenCalled()
    expect(cellAt(draw(program), 8, 7)?.value).toEqual(SelectedColor)
  })

  it('announces the active game when the program is entered', () => {
    vi.mocked(speak).mockClear()
    const program = createMusicalExerciseProgram(stubOptions)
    void program.initialize?.()

    expect(speak).toHaveBeenCalledExactlyOnceWith(EarTrainingGames[0].name)
  })
})
