import type { Instrument } from '../midi/instrument-data.js'

/**
 * Bank MSB reserved for sound boards. GM2 uses 121 for melodic sounds and 120 for drum kits; the rest of the MSB
 * space is unclaimed, so sound-board instruments are namespaced under an MSB of their own. Notes played on a
 * sound-board instrument are realized as samples inside the app and never reach the piano, so this bank is a purely
 * internal marker: no program change carrying it is ever transmitted.
 */
export const SoundBoardBankMsb = 126

/**
 * A key-to-sample mapping. Sound boards are one-shot: a sample starts on note-on and plays to completion, so note-off
 * does nothing and holding a key does not sustain.
 */
export interface SoundBoard {
  /**
   * MIDI note that plays the first sample. Samples fill the keys upward from here, and the mapping wraps, so every key
   * on an 88-key piano triggers something.
   */
  baseNote: number

  /**
   * ID of the {@link Instrument} that selects this board.
   */
  instrumentId: string

  /**
   * Sample names, in key order, resolved against the sample directory. A name is a game-relative path without its
   * extension, such as `mob/creeper/say1`.
   */
  samples: string[]
}

/**
 * Whether an instrument is a sound board rather than a MIDI patch.
 */
export const isSoundBoard = (instrument: Instrument) => instrument.bank.msb === SoundBoardBankMsb

/**
 * The sample a key triggers. The board's samples wrap, so notes outside the board's natural range still play.
 */
export const getSampleForNote = (board: SoundBoard, note: number) => {
  const offset = note - board.baseNote
  const index = ((offset % board.samples.length) + board.samples.length) % board.samples.length
  return board.samples[index]
}
