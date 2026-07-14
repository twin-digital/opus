import type { Instrument } from '../midi/instrument-data.js'
import { MinecraftBoards, MinecraftInstruments } from './minecraft.js'
import type { SoundBoard } from './model.js'

/**
 * Every sound board the app knows about.
 */
export const SoundBoards: SoundBoard[] = [...MinecraftBoards]

/**
 * Instruments that select a sound board. Combined with the GM instruments to form the full instrument set.
 */
export const SoundBoardInstruments: Instrument[] = [...MinecraftInstruments]

/**
 * Map allowing lookup of a sound board by the ID of the instrument that selects it. A lookup misses if an instrument
 * claims the sound-board bank without a board behind it.
 */
export const SoundBoardsByInstrumentId = SoundBoards.reduce<Record<string, SoundBoard | undefined>>((result, board) => {
  result[board.instrumentId] = board
  return result
}, {})

/**
 * Every sample referenced by a sound board, de-duplicated. This is both what `music-fetch-samples` downloads and what
 * the sample player warms its cache with.
 */
export const SoundBoardSampleNames = [...new Set(SoundBoards.flatMap((board) => board.samples))]
