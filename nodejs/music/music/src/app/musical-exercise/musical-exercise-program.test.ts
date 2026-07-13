import { describe, expect, it, vi } from 'vitest'

import type { MidiDevice } from '../../midi/midi-device.js'
import type { MidiScheduler } from '../../midi/sequencing.js'
import { createCanvas } from '../../ui/canvas.js'
import type { Cell } from '../../ui/drawable.js'
import type { RgbColor } from '../../ui/color.js'
import { EarTrainingGames } from './games.js'
import { createMusicalExerciseProgram } from './musical-exercise-program.js'

vi.mock('../speak.js', () => ({ speak: vi.fn(() => Promise.resolve()) }))
// the native MIDI stack can't load (or should be exercised) in unit tests; nothing here ever constructs a device
vi.mock('easymidi', () => ({ Input: vi.fn(), Output: vi.fn() }))
import { speak } from '../speak.js'

const makeStubOptions = () => ({
  // the program only hands the device to states that touch it on challenge playback/response,
  // which these tests never advance far enough to reach; the scheduler's cancel is invoked on
  // every switch/shutdown
  device: {} as unknown as MidiDevice,
  midi: { cancelAllSequences: vi.fn() } as unknown as MidiScheduler,
})

// findLast mirrors the engine's compositing: engine.draw() applies cells to the canvas via
// `cells.forEach -> canvas.set` in draw order, so the LAST cell at a coordinate wins. (See the
// layering test below, which exercises an actual overlap through a real canvas.)
const cellAt = (cells: Cell<RgbColor>[], x: number, y: number) => cells.findLast((cell) => cell.x === x && cell.y === y)

const press = (cell: Cell<RgbColor> | undefined) => {
  cell?.onPress?.({ type: 'press', x: cell.x, y: cell.y, absoluteX: cell.x, absoluteY: cell.y })
}

/** Flushes the speak -> initialize microtask chain. */
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const SelectedColor: RgbColor = [0, 127, 0]

describe('createMusicalExerciseProgram', () => {
  const draw = (program: ReturnType<typeof createMusicalExerciseProgram>) => program.getDrawable().draw()

  const start = async () => {
    vi.mocked(speak).mockClear()
    vi.mocked(speak).mockImplementation(() => Promise.resolve())
    const program = createMusicalExerciseProgram(makeStubOptions())
    void program.initialize?.()
    await settle()
    return program
  }

  it('lights every game on the right edge, with the active game highlighted', async () => {
    const program = await start()

    const cells = draw(program)
    EarTrainingGames.forEach((game, index) => {
      const expected = index === 0 ? SelectedColor : game.color
      expect(cellAt(cells, 8, 7 - index)?.value, game.name).toEqual(expected)
    })
  })

  it("shows the active game's identity color across the playfield top row", async () => {
    const program = await start()

    const cells = draw(program)
    for (let x = 0; x < 8; x++) {
      expect(cellAt(cells, x, 7)?.value).toEqual(EarTrainingGames[0].color)
    }
  })

  it('composites the identity bar over competing playfield cells, matching the engine (last-wins)', async () => {
    const program = await start()

    // replicate engine.draw(): apply cells to a canvas in draw order
    const cells = draw(program)
    const canvas = createCanvas<RgbColor>(9, 9)
    for (const cell of cells) {
      canvas.set(cell.x, cell.y, cell.value)
    }

    for (let x = 0; x < 8; x++) {
      expect(canvas.getData().get(x, 7)).toEqual(EarTrainingGames[0].color)
      // cellAt (findLast) agrees with the canvas result at every asserted coordinate
      expect(cellAt(cells, x, 7)?.value).toEqual(canvas.getData().get(x, 7))
    }
  })

  it('switches games on selector press: highlight moves, identity re-themes, name is spoken', async () => {
    const program = await start()
    vi.mocked(speak).mockClear()

    press(cellAt(draw(program), 8, 6))

    const cells = draw(program)
    expect(cellAt(cells, 8, 6)?.value).toEqual(SelectedColor)
    expect(cellAt(cells, 8, 7)?.value).toEqual(EarTrainingGames[0].color)
    expect(cellAt(cells, 0, 7)?.value).toEqual(EarTrainingGames[1].color)
    expect(speak).toHaveBeenCalledExactlyOnceWith(EarTrainingGames[1].name)
  })

  it('ignores presses on the already-active game', async () => {
    const program = await start()
    vi.mocked(speak).mockClear()

    press(cellAt(draw(program), 8, 7))

    expect(speak).not.toHaveBeenCalled()
    expect(cellAt(draw(program), 8, 7)?.value).toEqual(SelectedColor)
  })

  it('announces the active game when the program is entered', async () => {
    await start()

    expect(speak).toHaveBeenCalledExactlyOnceWith(EarTrainingGames[0].name)
  })

  it('does not start the challenge until the announcement finishes', async () => {
    const challengeSpy = vi.spyOn(EarTrainingGames[0], 'createChallenge')
    let finishSpeech = () => {
      /* replaced below */
    }
    vi.mocked(speak).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSpeech = resolve
        }),
    )

    const program = createMusicalExerciseProgram(makeStubOptions())
    void program.initialize?.()
    await settle()
    expect(challengeSpy).not.toHaveBeenCalled()

    finishSpeech()
    await settle()
    expect(challengeSpy).toHaveBeenCalledOnce()

    challengeSpy.mockRestore()
  })

  it('ignores selector presses before initialize and after shutdown', async () => {
    vi.mocked(speak).mockClear()
    vi.mocked(speak).mockImplementation(() => Promise.resolve())
    const program = createMusicalExerciseProgram(makeStubOptions())

    // before initialize: nothing should be announced or rebuilt
    press(cellAt(draw(program), 8, 6))
    expect(speak).not.toHaveBeenCalled()

    void program.initialize?.()
    await settle()
    void program.shutdown?.()
    vi.mocked(speak).mockClear()

    // after shutdown: stale drawables must not resurrect a machine
    press(cellAt(draw(program), 8, 6))
    expect(speak).not.toHaveBeenCalled()
  })

  it('only starts the last game when selections change while an announcement is in flight', async () => {
    const higherOrLowerSpy = vi.spyOn(EarTrainingGames[0], 'createChallenge')
    const perfectPitchSpy = vi.spyOn(EarTrainingGames[1], 'createChallenge')
    const speechResolvers: (() => void)[] = []
    vi.mocked(speak).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          speechResolvers.push(resolve)
        }),
    )

    const program = createMusicalExerciseProgram(makeStubOptions())
    void program.initialize?.()
    press(cellAt(draw(program), 8, 6)) // switch to Perfect Pitch...
    press(cellAt(draw(program), 8, 7)) // ...and back to Higher or Lower, all before any speech ends

    speechResolvers.forEach((resolve) => {
      resolve()
    })
    await settle()

    // only the finally-selected game's machine started; superseded machines never initialize
    expect(perfectPitchSpy).not.toHaveBeenCalled()
    expect(higherOrLowerSpy).toHaveBeenCalledOnce()

    higherOrLowerSpy.mockRestore()
    perfectPitchSpy.mockRestore()
  })

  it('cancels queued scheduler audio when switching games and on shutdown', async () => {
    vi.mocked(speak).mockImplementation(() => Promise.resolve())
    const options = makeStubOptions()
    const program = createMusicalExerciseProgram(options)
    void program.initialize?.()
    await settle()

    press(cellAt(draw(program), 8, 6))
    expect(options.midi.cancelAllSequences).toHaveBeenCalledTimes(1)

    void program.shutdown?.()
    expect(options.midi.cancelAllSequences).toHaveBeenCalledTimes(2)
  })
})
