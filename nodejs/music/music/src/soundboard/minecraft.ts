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
 * ID of the instrument that selects the board at `patch`. Both the board and its instrument are built from this, so a
 * board can never end up pointing at an ID no instrument carries — which would leave it selectable in the picker and
 * permanently silent.
 */
const boardInstrumentId = (patch: number) => `${patch}#${SoundBoardBankMsb}#0`

/**
 * Sound boards drawn from the Minecraft sound assets. Each board is one instrument in the Minecraft family, selected
 * by its patch number; the samples are listed in key order.
 *
 * Sample names are game-relative paths under `minecraft/sounds/`, without the `.ogg` extension. `music-fetch-samples`
 * resolves them against Mojang's asset index and downloads them; the audio itself is never checked in.
 *
 * Samples are chosen to be short. Nothing here stops a key from triggering a fifteen-second cave ambience, but a
 * one-shot that outlasts the key that started it makes the board unplayable.
 */
export const MinecraftBoards = [
  {
    instrumentId: boardInstrumentId(0),
    baseNote: BaseNote,
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
    instrumentId: boardInstrumentId(1),
    baseNote: BaseNote,
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
    instrumentId: boardInstrumentId(2),
    baseNote: BaseNote,
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
] satisfies SoundBoard[]

/**
 * Instruments that select the Minecraft boards. Patch number is the board's position in {@link MinecraftBoards}, which
 * also places its button in the picker's sound area.
 */
export const MinecraftInstruments = [
  {
    bank: { msb: SoundBoardBankMsb, lsb: 0 },
    family: MinecraftFamilyName,
    patch: 0,
    name: 'Mobs',
    id: boardInstrumentId(0),
    standard: 'none',
  },
  {
    bank: { msb: SoundBoardBankMsb, lsb: 0 },
    family: MinecraftFamilyName,
    patch: 1,
    name: 'Blocks and Items',
    id: boardInstrumentId(1),
    standard: 'none',
  },
  {
    bank: { msb: SoundBoardBankMsb, lsb: 0 },
    family: MinecraftFamilyName,
    patch: 2,
    name: 'Adventure',
    id: boardInstrumentId(2),
    standard: 'none',
  },
] satisfies Instrument[]
