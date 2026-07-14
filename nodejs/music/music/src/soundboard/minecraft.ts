import type { Instrument } from '../midi/instrument-data.js'
import { SoundBoardBankMsb, type SoundBoard } from './model.js'

/**
 * Family name for the Minecraft sound boards. Matches the `InstrumentFamily` of the same name.
 */
export const MinecraftFamilyName = 'Minecraft'

/**
 * Middle C. Boards fill the keys upward from here, so the sim's single-octave keyboard (60-72) reaches the first
 * thirteen samples of every board and a full-size piano wraps through the rest.
 */
const BaseNote = 60

/**
 * ID of the instrument that selects the board at `patch`.
 */
const boardInstrumentId = (patch: number) => `${patch}#${SoundBoardBankMsb}#0`

/**
 * The Minecraft boards: a name for the picker, and the samples each key triggers, in key order.
 *
 * Sample names are game-relative paths under `minecraft/sounds/`, without the `.ogg` extension. `music-fetch-samples`
 * resolves them against Mojang's asset index and downloads them; the audio itself is never checked in.
 *
 * Samples are chosen to be short. Nothing here stops a key from triggering a fifteen-second cave ambience, but a
 * one-shot that outlasts the key that started it makes the board unplayable.
 *
 * A board's position in this list is its patch number, and both the board and the instrument that selects it are
 * derived from the same entry — so the pairing between them holds by construction. Adding a board is adding one entry
 * (and widening the family's `lastPatch` in `InstrumentFamilies`).
 */
const definitions = [
  {
    name: 'Mobs',
    samples: [
      'mob/creeper/say1',
      'mob/creeper/death',
      'mob/zombie/say1',
      'mob/skeleton/say1',
      'mob/endermen/idle1',
      'mob/endermen/scream1',
      'mob/ghast/moan1',
      'mob/blaze/breathe1',
      'mob/slime/attack1',
      'mob/cow/say1',
      'mob/pig/say1',
      'mob/chicken/say1',
      'mob/sheep/say1',
      'mob/cat/meow1',
      'mob/villager/idle1',
      'mob/villager/haggle1',
    ],
  },
  {
    name: 'Blocks and Items',
    samples: [
      'random/anvil_land',
      'random/chestopen',
      'random/door_open',
      'random/door_close',
      'random/glass1',
      'random/break',
      'random/pop',
      'random/click',
      'random/fizz',
      'random/burp',
      'random/eat1',
      'random/drink',
      'dig/stone1',
      'dig/wood1',
      'dig/gravel1',
      'dig/grass1',
    ],
  },
  {
    name: 'Adventure',
    samples: [
      'random/explode1',
      'random/levelup',
      'random/orb',
      'random/bow',
      'random/bowhit1',
      'random/successful_hit',
      'mob/ghast/charge',
      'fire/fire',
      'fire/ignite',
      'liquid/lavapop',
      'liquid/heavy_splash',
      'fireworks/launch1',
      'fireworks/blast1',
      'fireworks/twinkle1',
      'mob/endermen/portal',
      'ambient/cave/cave1',
    ],
  },
] satisfies { name: string; samples: [string, ...string[]] }[]

/**
 * Sound boards drawn from the Minecraft sound assets.
 */
export const MinecraftBoards: SoundBoard[] = definitions.map(({ samples }, patch) => ({
  instrumentId: boardInstrumentId(patch),
  baseNote: BaseNote,
  samples,
}))

/**
 * Instruments that select the Minecraft boards.
 */
export const MinecraftInstruments: Instrument[] = definitions.map(({ name }, patch) => ({
  bank: { msb: SoundBoardBankMsb, lsb: 0 },
  family: MinecraftFamilyName,
  patch,
  name,
  id: boardInstrumentId(patch),
  standard: 'none',
}))
