import type { RgbColor } from '../../ui/color.js'
import type { CallAndResponseChallenge } from './call-and-response-challenge.js'
import { HigherOrLower } from './challenges/higher-or-lower.js'
import { SingleNoteEarTraining } from './challenges/single-note-ear-training.js'

/**
 * A selectable ear-training game: a challenge factory plus the identity used to present it.
 */
export interface EarTrainingGame {
  id: string

  /**
   * Display name, also spoken aloud when the game is selected.
   */
  name: string

  /**
   * The game's identity color. Shown on its selector pad when inactive and carried onto the
   * main screen while the game is being played, so the grid itself communicates which game
   * is active.
   */
  color: RgbColor

  /**
   * Creates a new randomized challenge for this game.
   */
  createChallenge: () => CallAndResponseChallenge
}

// the first entry is the default game, selected when the program is entered
export const EarTrainingGames: readonly EarTrainingGame[] = [
  {
    id: 'play-my-note',
    name: 'Play My Note',
    color: [0, 64, 127],
    createChallenge: () => SingleNoteEarTraining.createRandom(),
  },
  {
    id: 'higher-or-lower',
    name: 'Higher or Lower',
    color: [127, 80, 0],
    createChallenge: () => HigherOrLower.createRandom(),
  },
]
