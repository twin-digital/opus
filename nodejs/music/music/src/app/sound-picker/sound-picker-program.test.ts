import { describe, expect, it, vi } from 'vitest'

import type { MidiDevice } from '../../midi/midi-device.js'
import type { NovationLaunchpadMiniMk3 } from '../../vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'
import type { Cell } from '../../ui/drawable.js'
import type { RgbColor } from '../../ui/color.js'
import { createSoundPickerProgram } from './sound-picker-program.js'
import { InstrumentFamilyColors } from './sound-select-screen/colors.js'

vi.mock('../speak.js', () => ({ speak: vi.fn(() => Promise.resolve()) }))
vi.mock('../../audio/sample-player.js', () => ({
  SamplePlayer: class {
    close = vi.fn(() => Promise.resolve())
    load = vi.fn(() => Promise.resolve())
    play = vi.fn()
    stopAll = vi.fn()
  },
}))
import { speak } from '../speak.js'

/**
 * The selected side's pad breathes when split is on; at the program's initial clock (time 0) a breath sits exactly
 * halfway, scaling the display color by 0.3 + 0.7 * 0.5.
 */
const breathedAtTimeZero = (color: RgbColor): RgbColor => color.map((c) => c * (0.3 + (1 - 0.3) * 0.5)) as RgbColor

/** MIDI channels backing controller channels 0 (left hand) and 1 (right hand). */
const LeftMidiChannel = 3
const RightMidiChannel = 4

type NoteHandler = (note: { channel: number; note: number; velocity: number }) => void

interface Harness {
  program: ReturnType<typeof createSoundPickerProgram>
  /** handlers the controller registered on the synthesizer, keyed by event name */
  deviceHandlers: Map<string, NoteHandler[]>
  send: ReturnType<typeof vi.fn>
}

const makeProgram = async ({
  clearInitTraffic = true,
  runInitialize = true,
}: { clearInitTraffic?: boolean; runInitialize?: boolean } = {}): Promise<Harness> => {
  // Handler lists mirror EventEmitter semantics — the same listener registered twice fires twice — so tests can see
  // duplicate registrations that a keyed map would silently dedupe.
  const deviceHandlers = new Map<string, NoteHandler[]>()
  const send = vi.fn()
  const synthesizer = {
    on: vi.fn((event: string, handler: NoteHandler) => {
      deviceHandlers.set(event, [...(deviceHandlers.get(event) ?? []), handler])
    }),
    off: vi.fn((event: string, handler: NoteHandler) => {
      const handlers = deviceHandlers.get(event) ?? []
      const index = handlers.indexOf(handler)
      if (index >= 0) {
        handlers.splice(index, 1)
      }
    }),
    send,
  } as unknown as MidiDevice
  const launchpad = {
    events: { on: vi.fn(), off: vi.fn() },
    sendCommand: vi.fn(() => Promise.resolve()),
  } as unknown as NovationLaunchpadMiniMk3

  const program = createSoundPickerProgram(launchpad, synthesizer, { speakInstrumentNames: true })
  if (runInitialize) {
    await program.initialize?.()
    if (clearInitTraffic) {
      send.mockClear() // drop initialization traffic (program changes, stop-all-sound)
    }
  }

  return { program, deviceHandlers, send }
}

const cellAt = (cells: Cell<RgbColor>[], x: number, y: number) => cells.findLast((cell) => cell.x === x && cell.y === y)

const press = (cell: Cell<RgbColor> | undefined) => {
  expect(cell, 'expected a pressable cell at that position').toBeDefined()
  cell?.onPress?.({ type: 'press', x: cell.x, y: cell.y, absoluteX: cell.x, absoluteY: cell.y })
}

const drawCells = (harness: Harness) => harness.program.getDrawable().draw()

const fireNote = (
  harness: Harness,
  event: 'noteon' | 'noteoff',
  note: { channel: number; note: number; velocity: number },
) => {
  ;[...(harness.deviceHandlers.get(event) ?? [])].forEach((handler) => {
    handler(note)
  })
}

const pressToggle = (harness: Harness) => {
  press(cellAt(drawCells(harness), 8, 7))
}

const playedChannels = (send: ReturnType<typeof vi.fn>, note: number) =>
  send.mock.calls
    .filter(([type, payload]) => type === 'noteon' && (payload as { note: number }).note === note)
    .map(([, payload]) => (payload as { channel: number }).channel)

describe('createSoundPickerProgram split keyboard', () => {
  it('starts unsplit: the whole keyboard plays one sound on the right hand channel', async () => {
    const harness = await makeProgram()

    fireNote(harness, 'noteon', { channel: 0, note: 30, velocity: 64 })
    fireNote(harness, 'noteon', { channel: 0, note: 90, velocity: 64 })

    expect(playedChannels(harness.send, 30)).toEqual([RightMidiChannel])
    expect(playedChannels(harness.send, 90)).toEqual([RightMidiChannel])
  })

  it('starts with only the right side pad and the toggle lit, in the piano family color', async () => {
    const harness = await makeProgram()
    const cells = drawCells(harness)

    expect(cellAt(cells, 8, 0)).toBeUndefined()
    expect(cellAt(cells, 8, 1)?.value).toEqual(InstrumentFamilyColors.Piano)
    expect(cellAt(cells, 8, 7)?.value).toEqual(InstrumentFamilyColors.Piano)
  })

  describe('turning split on', () => {
    it('keeps the current sound on the right and puts the standard drum kit on the left', async () => {
      const harness = await makeProgram()

      pressToggle(harness)

      // the left hand received the GM standard kit: drum bank (MSB 120) select + program 0 on its channel
      expect(harness.send.mock.calls).toEqual(
        expect.arrayContaining([
          ['cc', expect.objectContaining({ channel: LeftMidiChannel, controller: 0, value: 120 })],
          ['program', expect.objectContaining({ channel: LeftMidiChannel, number: 0 })],
        ]),
      )

      fireNote(harness, 'noteon', { channel: 0, note: 59, velocity: 64 })
      fireNote(harness, 'noteon', { channel: 0, note: 60, velocity: 64 })
      expect(playedChannels(harness.send, 59)).toEqual([LeftMidiChannel])
      expect(playedChannels(harness.send, 60)).toEqual([RightMidiChannel])
    })

    it('stops sounding notes, announces "two instruments", and lights both side pads', async () => {
      const harness = await makeProgram()
      vi.mocked(speak).mockClear()

      pressToggle(harness)

      expect(harness.send.mock.calls).toEqual(
        expect.arrayContaining([
          ['cc', expect.objectContaining({ channel: LeftMidiChannel, controller: 0x78, value: 0 })],
          ['cc', expect.objectContaining({ channel: RightMidiChannel, controller: 0x78, value: 0 })],
        ]),
      )

      // exactly one announcement: the programmatic instrument assignments behind the toggle stay silent
      expect(vi.mocked(speak).mock.calls).toEqual([['two instruments']])

      const cells = drawCells(harness)
      expect(cellAt(cells, 8, 0)?.value).toEqual(InstrumentFamilyColors['Drum Kit'])
      expect(cellAt(cells, 8, 1)?.value).toEqual(breathedAtTimeZero(InstrumentFamilyColors.Piano))
    })
  })

  it('announces side selection', async () => {
    const harness = await makeProgram()

    pressToggle(harness)
    press(cellAt(drawCells(harness), 8, 0))

    expect(speak).toHaveBeenCalledWith('left hand')
  })

  it('collapses to the selected side when split turns off', async () => {
    const harness = await makeProgram()

    pressToggle(harness)
    press(cellAt(drawCells(harness), 8, 0)) // select the left hand (the drum kit)
    pressToggle(harness)

    expect(speak).toHaveBeenCalledWith('one instrument')

    // the whole keyboard now plays the left hand's channel — "the lit side is the sound you keep"
    fireNote(harness, 'noteon', { channel: 0, note: 90, velocity: 64 })
    expect(playedChannels(harness.send, 90)).toEqual([LeftMidiChannel])

    const cells = drawCells(harness)
    expect(cellAt(cells, 8, 0)?.value).toEqual(InstrumentFamilyColors['Drum Kit'])
    expect(cellAt(cells, 8, 1)).toBeUndefined()
    expect(cellAt(cells, 8, 7)?.value).toEqual(InstrumentFamilyColors['Drum Kit'])
  })

  it('re-splitting after a collapse gives the left hand the standard kit again', async () => {
    const harness = await makeProgram()

    pressToggle(harness)
    press(cellAt(drawCells(harness), 8, 0))
    pressToggle(harness) // collapse to the drum kit
    pressToggle(harness) // split again

    // the drum kit the user kept became the right hand's sound; the left is the standard kit default
    const cells = drawCells(harness)
    expect(cellAt(cells, 8, 1)?.value).toEqual(breathedAtTimeZero(InstrumentFamilyColors['Drum Kit']))
    expect(cellAt(cells, 8, 0)?.value).toEqual(InstrumentFamilyColors['Drum Kit'])

    fireNote(harness, 'noteon', { channel: 0, note: 72, velocity: 64 })
    expect(playedChannels(harness.send, 72)).toEqual([RightMidiChannel])
  })

  it('initializes both hands with the default piano and stops all sound', async () => {
    const harness = await makeProgram({ clearInitTraffic: false })

    for (const channel of [LeftMidiChannel, RightMidiChannel]) {
      const calls = harness.send.mock.calls.filter(
        ([, payload]) => (payload as { channel: number }).channel === channel,
      )
      const bankSelect = calls.findIndex(
        ([type, payload]) => type === 'cc' && (payload as { controller: number }).controller === 0,
      )
      const programChange = calls.findIndex(([type]) => type === 'program')

      // the bank select must precede the program change, or the piano resolves the patch in the wrong bank
      expect(bankSelect).toBeGreaterThanOrEqual(0)
      expect(programChange).toBeGreaterThan(bankSelect)
      expect(calls[bankSelect][1]).toMatchObject({ value: 121 }) // GM2 melodic bank
      expect(calls[programChange][1]).toMatchObject({ number: 0 }) // Acoustic Grand Piano
      expect(calls).toEqual(
        expect.arrayContaining([['cc', expect.objectContaining({ controller: 0x78, value: 0 })]]), // all sound off
      )
      // the level is written unconditionally: the piano remembers a stale CC 7 across program switches
      expect(calls).toEqual(expect.arrayContaining([['cc', expect.objectContaining({ controller: 0x07, value: 127 })]]))
    }
  })

  it('renders a frame drawn before initialize() instead of throwing', async () => {
    const harness = await makeProgram({ runInitialize: false })

    harness.program.update?.(0.1)
    expect(() => drawCells(harness)).not.toThrow()
  })

  it('edits the selected side: a family picked after selecting the left hand lands on the left channel', async () => {
    const harness = await makeProgram()
    pressToggle(harness)
    press(cellAt(drawCells(harness), 8, 0)) // select the left hand
    press(cellAt(drawCells(harness), 3, 7)) // pick the Guitar family from the family selector
    harness.program.update?.(0.5) // advance to the peak of a breath, where the selected pad wears its full color

    // the left hand received the family's first instrument; the right hand kept the piano
    expect(harness.send.mock.calls).toEqual(
      expect.arrayContaining([['program', expect.objectContaining({ channel: LeftMidiChannel, number: 24 })]]),
    )
    expect(harness.send.mock.calls).not.toEqual(
      expect.arrayContaining([['program', expect.objectContaining({ channel: RightMidiChannel, number: 24 })]]),
    )

    // the left side pad wears the new family color, and collapsing keeps the picked sound
    expect(cellAt(drawCells(harness), 8, 0)?.value).toEqual(InstrumentFamilyColors.Guitar)
    pressToggle(harness)
    fireNote(harness, 'noteon', { channel: 0, note: 90, velocity: 64 })
    expect(playedChannels(harness.send, 90)).toEqual([LeftMidiChannel])
  })

  it('re-splitting resets the left hand mixer along with its instrument', async () => {
    const harness = await makeProgram()
    pressToggle(harness)
    press(cellAt(drawCells(harness), 4, 8)) // levels screen
    press(cellAt(drawCells(harness), 0, 0)) // mute the left hand
    pressToggle(harness) // collapse to the right hand
    pressToggle(harness) // split again — the left hand must come back audible

    fireNote(harness, 'noteon', { channel: 0, note: 30, velocity: 64 })
    expect(playedChannels(harness.send, 30)).toEqual([LeftMidiChannel])
  })

  it('re-splitting resets a stale right hand mixer when the kept sound moves onto it', async () => {
    const harness = await makeProgram()
    pressToggle(harness)
    press(cellAt(drawCells(harness), 4, 8)) // levels screen
    press(cellAt(drawCells(harness), 0, 1)) // mute the right hand
    press(cellAt(drawCells(harness), 8, 0)) // select the left hand
    pressToggle(harness) // collapse to the left hand — the muted right channel becomes invisible
    pressToggle(harness) // split again: the kept sound moves to the right hand, which must come back audible

    fireNote(harness, 'noteon', { channel: 0, note: 72, velocity: 64 })
    expect(playedChannels(harness.send, 72)).toEqual([RightMidiChannel])
  })

  it('splitting leaves the right hand mixer alone when it was already selected', async () => {
    const harness = await makeProgram()
    press(cellAt(drawCells(harness), 4, 8)) // levels screen
    press(cellAt(drawCells(harness), 0, 1)) // mute the single (right hand) sound — a live, visible setting
    pressToggle(harness)

    // the kept side stays muted; the fresh left hand plays
    fireNote(harness, 'noteon', { channel: 0, note: 72, velocity: 64 })
    fireNote(harness, 'noteon', { channel: 0, note: 30, velocity: 64 })
    expect(playedChannels(harness.send, 72)).toEqual([])
    expect(playedChannels(harness.send, 30)).toEqual([LeftMidiChannel])
  })

  it('never overdraws the side column', async () => {
    const harness = await makeProgram()
    pressToggle(harness)
    press(cellAt(drawCells(harness), 4, 8)) // the levels screen sits beside the side column's pads

    const cells = drawCells(harness)
    for (const y of [0, 1, 7]) {
      expect(cells.filter((cell) => cell.x === 8 && cell.y === y)).toHaveLength(1)
    }
  })

  it('animates the side column once split: the toggle cycles and the selected side breathes', async () => {
    const harness = await makeProgram()
    pressToggle(harness)

    const atStart = drawCells(harness)
    harness.program.update?.(1.1) // into the first black gap of the toggle cycle
    const inGap = drawCells(harness)
    harness.program.update?.(0.6) // clock 1.7, inside the right color's window
    const rightPhase = drawCells(harness)

    expect(cellAt(atStart, 8, 7)?.value).toEqual(InstrumentFamilyColors['Drum Kit'])
    expect(cellAt(inGap, 8, 7)?.value).toEqual([0, 0, 0])
    expect(cellAt(rightPhase, 8, 7)?.value).toEqual(InstrumentFamilyColors.Piano)

    // the selected (right) side's brightness moves with the clock
    expect(cellAt(inGap, 8, 1)?.value).not.toEqual(cellAt(atStart, 8, 1)?.value)
  })

  it('muting a row affects only its own hand and leaves the side selection alone', async () => {
    const harness = await makeProgram()
    pressToggle(harness)
    press(cellAt(drawCells(harness), 4, 8)) // switch to the levels screen
    press(cellAt(drawCells(harness), 0, 0)) // the left hand row's mute button

    fireNote(harness, 'noteon', { channel: 0, note: 30, velocity: 64 })
    fireNote(harness, 'noteon', { channel: 0, note: 72, velocity: 64 })
    expect(playedChannels(harness.send, 30)).toEqual([])
    expect(playedChannels(harness.send, 72)).toEqual([RightMidiChannel])

    // muting did not move the selection: collapsing still keeps the right hand's sound
    pressToggle(harness)
    fireNote(harness, 'noteon', { channel: 0, note: 40, velocity: 64 })
    expect(playedChannels(harness.send, 40)).toEqual([RightMidiChannel])
  })

  it('re-initializing resets mixer state, so a stale mute cannot silence a zone', async () => {
    const harness = await makeProgram()
    pressToggle(harness)
    press(cellAt(drawCells(harness), 4, 8)) // levels screen
    press(cellAt(drawCells(harness), 0, 0)) // mute the left hand

    await harness.program.initialize?.()
    harness.send.mockClear()

    pressToggle(harness)
    fireNote(harness, 'noteon', { channel: 0, note: 30, velocity: 64 })
    expect(playedChannels(harness.send, 30)).toEqual([LeftMidiChannel])
  })

  it('shows one fader row when unsplit and two when split, aligned with the side pads', async () => {
    const harness = await makeProgram()

    // switch to the levels screen (top bar, second-from-left of the two screen buttons)
    press(cellAt(drawCells(harness), 4, 8))
    const unsplit = drawCells(harness)
    expect(cellAt(unsplit, 0, 1), 'right hand mute button on its side pad row').toBeDefined()
    expect(cellAt(unsplit, 0, 0), 'no left hand row while unsplit').toBeUndefined()

    pressToggle(harness)
    const split = drawCells(harness)
    expect(cellAt(split, 0, 0), 'left hand mute button appears once split').toBeDefined()
    expect(cellAt(split, 0, 1)).toBeDefined()
  })
})
